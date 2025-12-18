import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/heatmap' });
  const orgId = params.orgId;
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');
    const tgChatId = searchParams.get('tgChatId');

    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check org membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use admin client
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Get chat IDs for this org
    let chatIds: string[] = [];
    
    if (tgChatId) {
      const { data: mapping } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId)
        .eq('tg_chat_id', tgChatId)
        .maybeSingle();
      
      if (!mapping) {
        return NextResponse.json({ error: 'Group not found in organization' }, { status: 404 });
      }
      chatIds = [tgChatId];
    } else {
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
      
      chatIds = orgGroups?.map(g => String(g.tg_chat_id)) || [];
    }

    if (chatIds.length === 0) {
      // Return empty heatmap
      const emptyData: { day_of_week: number; hour_of_day: number; message_count: number }[] = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          emptyData.push({ day_of_week: day, hour_of_day: hour, message_count: 0 });
        }
      }
      return NextResponse.json({ data: emptyData });
    }

    // Get activity - NO org_id filter!
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: events, error: eventsError } = await adminSupabase
      .from('activity_events')
      .select('created_at')
      .in('tg_chat_id', chatIds)
      .eq('event_type', 'message')
      .gte('created_at', startDate.toISOString());

    if (eventsError) {
      logger.error({ error: eventsError.message }, 'Error fetching events');
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    // Build heatmap: day_of_week (0=Sun, 6=Sat) x hour_of_day (0-23)
    const heatmap: Record<string, number> = {};
    
    // Initialize all cells
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap[`${day}-${hour}`] = 0;
      }
    }

    // Count events
    events?.forEach(event => {
      const date = new Date(event.created_at);
      const dayOfWeek = date.getUTCDay(); // 0=Sun
      const hour = date.getUTCHours();
      heatmap[`${dayOfWeek}-${hour}`]++;
    });

    // Convert to array format
    const data: { day_of_week: number; hour_of_day: number; message_count: number }[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        data.push({
          day_of_week: day,
          hour_of_day: hour,
          message_count: heatmap[`${day}-${hour}`]
        });
      }
    }

    logger.debug({ 
      org_id: orgId, 
      chat_ids: chatIds.length,
      events_count: events?.length || 0
    }, 'Heatmap data fetched');

    return NextResponse.json({ data });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Heatmap error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
