import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';

// GET /api/telegram/webapp/orgs/[orgId]/events - Get public events for organization
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // Fetch organization info
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, logo_url')
      .eq('id', orgId)
      .single();
    
    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    
    // Fetch upcoming published events (both public and private - MiniApp users are org members)
    const now = new Date().toISOString().split('T')[0];
    
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`
        id,
        title,
        description,
        cover_image_url,
        event_type,
        location_info,
        event_date,
        end_date,
        start_time,
        end_time,
        requires_payment,
        default_price,
        currency,
        capacity,
        status
      `)
      .eq('org_id', orgId)
      .eq('status', 'published')
      .gte('event_date', now)
      .order('event_date', { ascending: true })
      .limit(20);
    
    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }
    
    // Get registration counts for each event
    const eventIds = events?.map(e => e.id) || [];
    
    let registrationCounts: Record<string, number> = {};
    
    if (eventIds.length > 0) {
      const { data: registrations } = await supabase
        .from('event_registrations')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('status', 'registered');
      
      if (registrations) {
        registrations.forEach(r => {
          registrationCounts[r.event_id] = (registrationCounts[r.event_id] || 0) + 1;
        });
      }
    }
    
    // Add registration counts to events
    const eventsWithCounts = events?.map(event => ({
      ...event,
      registered_count: registrationCounts[event.id] || 0
    })) || [];
    
    // Add cache-busting to org logo URL to prevent Telegram WebView from caching old images
    const orgWithFreshLogo = {
      ...org,
      logo_url: org.logo_url ? `${org.logo_url.split('?')[0]}?v=${Date.now()}` : null
    };
    
    return NextResponse.json({
      organization: orgWithFreshLogo,
      events: eventsWithCounts
    });
    
  } catch (error) {
    console.error('Error in org events API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

