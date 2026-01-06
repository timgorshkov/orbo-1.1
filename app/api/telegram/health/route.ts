import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

// Service role client for bypassing RLS
const supabaseServiceRole = createAdminServer();

// Type for health status returned from RPC
interface HealthStatus {
  status: string;
  last_success: string | null;
  last_failure: string | null;
  failure_count_24h: number;
}

export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/health' });
  try {
    // Get all telegram groups
    const { data: groups, error } = await supabaseServiceRole
      .from('telegram_groups')
      .select('id, tg_chat_id, title, last_sync_at, bot_status');
    
    if (error) {
      logger.error({ error: error.message }, '[Telegram Health] Error fetching groups');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!groups || groups.length === 0) {
      return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        global_status: {
          status: 'unknown',
          last_event_at: null,
          last_event_from_group: null,
          minutes_since_last_event: null,
          active_groups_24h: 0,
          total_groups: 0
        }
      });
    }
    
    // Find most recent event across ALL groups (global webhook status)
    let mostRecentSync: { 
      last_sync_at: string; 
      title: string; 
      tg_chat_id: number;
    } | null = null;
    let mostRecentTime = 0;
    
    for (const group of groups) {
      if (group.last_sync_at) {
        const syncTime = new Date(group.last_sync_at).getTime();
        if (syncTime > mostRecentTime) {
          mostRecentTime = syncTime;
          mostRecentSync = {
            last_sync_at: group.last_sync_at,
            title: group.title,
            tg_chat_id: group.tg_chat_id
          };
        }
      }
    }
    
    // Calculate minutes since last event (from ANY group)
    const now = new Date();
    const minutesSinceLastEvent = mostRecentSync 
      ? Math.round((now.getTime() - new Date(mostRecentSync.last_sync_at).getTime()) / 60000)
      : null;
    
    // Global webhook status logic:
    // - Healthy: Last event < 30 minutes ago
    // - Degraded: Last event 30 minutes - 3 hours ago
    // - Unhealthy: Last event > 3 hours ago (technical webhook failure)
    let globalStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' = 'unknown';
    
    if (minutesSinceLastEvent !== null) {
      if (minutesSinceLastEvent < 30) {
        globalStatus = 'healthy';
      } else if (minutesSinceLastEvent < 180) { // 3 hours
        globalStatus = 'degraded';
      } else {
        globalStatus = 'unhealthy';
      }
    }
    
    // Count active groups in last 24 hours
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeGroups24h = groups.filter(g => 
      g.last_sync_at && new Date(g.last_sync_at) > twentyFourHoursAgo
    ).length;
    
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      global_status: {
        status: globalStatus,
        last_event_at: mostRecentSync?.last_sync_at || null,
        last_event_from_group: mostRecentSync ? {
          title: mostRecentSync.title,
          tg_chat_id: mostRecentSync.tg_chat_id
        } : null,
        minutes_since_last_event: minutesSinceLastEvent,
        active_groups_24h: activeGroups24h,
        total_groups: groups.length
      }
    });
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, '[Telegram Health] Unexpected error');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

