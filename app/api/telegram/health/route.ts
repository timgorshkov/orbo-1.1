import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client for bypassing RLS
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

// Type for health status returned from RPC
interface HealthStatus {
  status: string;
  last_success: string | null;
  last_failure: string | null;
  failure_count_24h: number;
}

export async function GET(req: NextRequest) {
  try {
    // Get all telegram groups
    const { data: groups, error } = await supabaseServiceRole
      .from('telegram_groups')
      .select('id, tg_chat_id, title, last_sync_at, bot_status');
    
    if (error) {
      console.error('[Telegram Health] Error fetching groups:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Get health status for each group
    const healthStatuses = await Promise.all(
      (groups || []).map(async (group) => {
        const { data: status, error: statusError } = await supabaseServiceRole
          .rpc('get_telegram_health_status', {
            p_tg_chat_id: group.tg_chat_id
          })
          .single();
        
        if (statusError) {
          console.error(`[Telegram Health] Error fetching health for group ${group.tg_chat_id}:`, statusError);
        }
        
        // Calculate minutes since last sync
        let minutesSinceSync = null;
        if (group.last_sync_at) {
          const lastSync = new Date(group.last_sync_at);
          const now = new Date();
          minutesSinceSync = Math.round((now.getTime() - lastSync.getTime()) / 60000);
        }
        
        const healthStatus: HealthStatus = (status as HealthStatus) || {
          status: 'unknown',
          last_success: null,
          last_failure: null,
          failure_count_24h: 0
        };
        
        // Get org_id from org_telegram_groups mapping
        const { data: orgMapping } = await supabaseServiceRole
          .from('org_telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', group.tg_chat_id)
          .limit(1)
          .single();
        
        return {
          id: group.id,
          tg_chat_id: group.tg_chat_id,
          title: group.title,
          org_id: orgMapping?.org_id || null,
          bot_status: group.bot_status,
          last_sync_at: group.last_sync_at,
          minutes_since_sync: minutesSinceSync,
          health: healthStatus
        };
      })
    );
    
    // Calculate overall health
    const healthyCount = healthStatuses.filter(g => g.health.status === 'healthy').length;
    const unhealthyCount = healthStatuses.filter(g => g.health.status === 'unhealthy').length;
    const totalCount = healthStatuses.length;
    
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_groups: totalCount,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        overall_status: unhealthyCount === 0 ? 'healthy' : unhealthyCount < totalCount / 2 ? 'degraded' : 'unhealthy'
      },
      groups: healthStatuses
    });
  } catch (error) {
    console.error('[Telegram Health] Unexpected error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

