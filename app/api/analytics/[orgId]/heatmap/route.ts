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
    let telegramChatIds: string[] = [];
    let includeWhatsApp = false;
    
    if (tgChatId) {
      if (tgChatId === '0') {
        includeWhatsApp = true;
      } else {
        const { data: mapping } = await adminSupabase
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', orgId)
          .eq('tg_chat_id', tgChatId)
          .maybeSingle();
        
        if (!mapping) {
          return NextResponse.json({ error: 'Group not found in organization' }, { status: 404 });
        }
        telegramChatIds = [tgChatId];
      }
    } else {
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
      
      telegramChatIds = orgGroups?.map(g => String(g.tg_chat_id)) || [];
      includeWhatsApp = true;
    }

    // Build heatmap: day_of_week (0=Sun, 6=Sat) x hour_of_day (0-23)
    const heatmap: Record<string, number> = {};
    
    // Initialize all cells
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap[`${day}-${hour}`] = 0;
      }
    }

    if (telegramChatIds.length === 0 && !includeWhatsApp) {
      // Return empty heatmap
      const data: { day_of_week: number; hour_of_day: number; message_count: number }[] = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          data.push({ day_of_week: day, hour_of_day: hour, message_count: 0 });
        }
      }
      return NextResponse.json({ data });
    }

    // Get activity
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch Telegram events - NO org_id filter
    if (telegramChatIds.length > 0) {
      const { data: telegramEvents, error: telegramError } = await adminSupabase
        .from('activity_events')
        .select('created_at')
        .in('tg_chat_id', telegramChatIds)
        .eq('event_type', 'message')
        .gte('created_at', startDate.toISOString());

      if (telegramError) {
        logger.error({ error: telegramError.message }, 'Error fetching telegram events');
      } else {
        telegramEvents?.forEach(event => {
          const date = new Date(event.created_at);
          const dayOfWeek = date.getUTCDay(); // 0=Sun
          const hour = date.getUTCHours();
          heatmap[`${dayOfWeek}-${hour}`]++;
        });
      }
    }

    // Fetch WhatsApp events - WITH org_id filter
    if (includeWhatsApp) {
      const { data: whatsappEvents, error: whatsappError } = await adminSupabase
        .from('activity_events')
        .select('created_at')
        .eq('org_id', orgId)
        .eq('tg_chat_id', 0)
        .eq('event_type', 'message')
        .gte('created_at', startDate.toISOString());

      if (whatsappError) {
        logger.error({ error: whatsappError.message }, 'Error fetching whatsapp events');
      } else {
        whatsappEvents?.forEach(event => {
          const date = new Date(event.created_at);
          const dayOfWeek = date.getUTCDay();
          const hour = date.getUTCHours();
          heatmap[`${dayOfWeek}-${hour}`]++;
        });
      }
    }

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

    // Add cache headers - data is user-specific but can be cached briefly
    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=300'
      }
    });
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
