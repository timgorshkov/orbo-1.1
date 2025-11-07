import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client for bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

/**
 * Debug endpoint for TelegramHealthStatus widget
 * GET /api/debug/health-widget
 * 
 * Returns diagnostic information to help debug why the widget is not working
 */
export async function GET(req: NextRequest) {
  try {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // Check 1: Count events in telegram_health_events
    const { data: eventCount, error: countError } = await supabaseAdmin
      .from('telegram_health_events')
      .select('*', { count: 'exact', head: true });
    
    diagnostics.checks.total_events = {
      count: eventCount?.length || 0,
      error: countError?.message || null
    };

    // Check 2: Recent events (last 24 hours)
    const { data: recentEvents, error: recentError } = await supabaseAdmin
      .from('telegram_health_events')
      .select('id, tg_chat_id, event_type, status, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);
    
    diagnostics.checks.recent_events = {
      count: recentEvents?.length || 0,
      events: recentEvents || [],
      error: recentError?.message || null
    };

    // Check 3: Events by status
    const { data: eventsByStatus, error: statusError } = await supabaseAdmin
      .from('telegram_health_events')
      .select('status')
      .order('created_at', { ascending: false })
      .limit(100);
    
    const statusCounts: Record<string, number> = {};
    eventsByStatus?.forEach(event => {
      statusCounts[event.status] = (statusCounts[event.status] || 0) + 1;
    });

    diagnostics.checks.events_by_status = {
      counts: statusCounts,
      error: statusError?.message || null
    };

    // Check 4: All telegram groups with last_sync_at
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from('telegram_groups')
      .select('tg_chat_id, title, last_sync_at, bot_status')
      .order('last_sync_at', { ascending: false, nullsFirst: false })
      .limit(10);
    
    const groupsWithAge = groups?.map(g => {
      const minutesSinceSync = g.last_sync_at 
        ? Math.round((Date.now() - new Date(g.last_sync_at).getTime()) / 60000)
        : null;
      return {
        tg_chat_id: g.tg_chat_id,
        title: g.title,
        last_sync_at: g.last_sync_at,
        minutes_since_sync: minutesSinceSync,
        bot_status: g.bot_status,
        health_status: minutesSinceSync === null 
          ? 'unhealthy' 
          : minutesSinceSync < 15 
            ? 'healthy' 
            : minutesSinceSync < 60 
              ? 'degraded' 
              : 'unhealthy'
      };
    });

    diagnostics.checks.telegram_groups = {
      count: groups?.length || 0,
      groups: groupsWithAge || [],
      error: groupsError?.message || null
    };

    // Check 5: Test get_telegram_health_status RPC for first group
    if (groups && groups.length > 0) {
      const firstGroupChatId = groups[0].tg_chat_id;
      const { data: healthStatus, error: healthError } = await supabaseAdmin
        .rpc('get_telegram_health_status', { p_tg_chat_id: firstGroupChatId })
        .single();
      
      diagnostics.checks.rpc_test = {
        tg_chat_id: firstGroupChatId,
        result: healthStatus || null,
        error: healthError?.message || null
      };
    }

    // Check 6: Test /api/telegram/health endpoint
    try {
      const healthApiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/telegram/health`;
      const healthResponse = await fetch(healthApiUrl);
      const healthData = await healthResponse.json();
      
      diagnostics.checks.health_api = {
        status: healthResponse.status,
        ok: healthResponse.ok,
        data: healthData
      };
    } catch (healthApiError: any) {
      diagnostics.checks.health_api = {
        error: healthApiError.message
      };
    }

    // Check 7: Cron job last execution (check logs)
    diagnostics.checks.cron_info = {
      note: 'Check Vercel logs for recent executions of /api/cron/telegram-health-check',
      expected_schedule: 'Every 10 minutes (*/10 * * * *)'
    };

    // Analysis & Recommendations
    diagnostics.analysis = {
      total_events: diagnostics.checks.total_events.count,
      recent_events_24h: diagnostics.checks.recent_events.count,
      total_groups: diagnostics.checks.telegram_groups.count,
      
      issues: [],
      recommendations: []
    };

    // Issue detection
    if (diagnostics.checks.total_events.count === 0) {
      diagnostics.analysis.issues.push({
        severity: 'critical',
        issue: 'No events in telegram_health_events table',
        cause: 'Cron job /api/cron/telegram-health-check may not be running or not logging events',
        recommendation: 'Check Vercel cron job logs. If all groups are healthy (<15 min since sync), cron job does not log events. Consider logging ALL events (including healthy).'
      });
    }

    if (diagnostics.checks.recent_events.count === 0 && diagnostics.checks.total_events.count > 0) {
      diagnostics.analysis.issues.push({
        severity: 'warning',
        issue: 'No recent events (last 24 hours)',
        cause: 'All groups may be healthy (no degraded/unhealthy events to log)',
        recommendation: 'Check if all groups have last_sync_at < 15 minutes ago. If yes, modify cron job to log all events (including healthy).'
      });
    }

    const allHealthy = groupsWithAge?.every(g => g.health_status === 'healthy');
    if (allHealthy) {
      diagnostics.analysis.recommendations.push({
        action: 'Modify cron job to log ALL events (including healthy)',
        reason: 'Currently all groups are healthy, so no events are being logged. This makes RPC return NULL, causing widget to show no data.',
        file: 'app/api/cron/telegram-health-check/route.ts',
        change: 'Remove "if (status !== \'healthy\')" condition around log_telegram_health() call'
      });
    }

    return NextResponse.json(diagnostics, { status: 200 });

  } catch (error: any) {
    console.error('[Debug Health Widget] Error:', error);
    return NextResponse.json({ 
      error: 'Debug failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

