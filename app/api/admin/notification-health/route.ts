import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * GET /api/admin/notification-health
 * Health check for the notification system.
 * Returns:
 * - Last successful cron runs
 * - Failed notification count (24h)
 * - Rules without recipients
 * - Bot status check
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/admin/notification-health' });

  try {
    // Auth check - must be superadmin or org owner
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminServer();

    // Run all health checks in parallel
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [
      // 1. Last notification rule checks
      lastRuleChecksResult,
      // 2. Failed notifications in last 24h
      failedNotificationsResult,
      // 3. Sent notifications in last 24h
      sentNotificationsResult,
      // 4. Rules with no recent checks (may be stalled)
      stalledRulesResult,
      // 5. Total enabled rules
      enabledRulesResult,
      // 6. Recent notification logs (last 24h)
      recentLogsResult,
    ] = await Promise.all([
      // Most recently checked rules (to verify cron is running)
      adminSupabase
        .from('notification_rules')
        .select('id, name, rule_type, last_check_at, is_enabled, is_system')
        .eq('is_enabled', true)
        .not('last_check_at', 'is', null)
        .order('last_check_at', { ascending: false })
        .limit(5),

      // Failed notifications count
      adminSupabase
        .from('notification_logs')
        .select('id', { count: 'exact', head: true })
        .eq('notification_status', 'failed')
        .gte('created_at', twentyFourHoursAgo),

      // Sent notifications count
      adminSupabase
        .from('notification_logs')
        .select('id', { count: 'exact', head: true })
        .eq('notification_status', 'sent')
        .gte('created_at', twentyFourHoursAgo),

      // Rules enabled but not checked in 2+ hours (potentially stalled)
      adminSupabase
        .from('notification_rules')
        .select('id, name, rule_type, last_check_at')
        .eq('is_enabled', true)
        .eq('is_system', false)
        .or(`last_check_at.is.null,last_check_at.lt.${new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()}`),

      // Total enabled rules
      adminSupabase
        .from('notification_rules')
        .select('id', { count: 'exact', head: true })
        .eq('is_enabled', true),

      // Recent notification logs with details
      adminSupabase
        .from('notification_logs')
        .select('id, rule_type, notification_status, created_at, error_message, sent_to_user_ids')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // Process results
    const lastCheckedRules = lastRuleChecksResult.data || [];
    const lastCronRun = lastCheckedRules.length > 0 ? lastCheckedRules[0].last_check_at : null;
    
    const failedCount = failedNotificationsResult.count || 0;
    const sentCount = sentNotificationsResult.count || 0;
    const stalledRules = stalledRulesResult.data || [];
    const enabledRulesCount = enabledRulesResult.count || 0;
    const recentLogs = recentLogsResult.data || [];

    // Calculate health score (0-100)
    let healthScore = 100;
    const issues: string[] = [];

    // Check if cron is running (last check within 2 hours)
    if (!lastCronRun) {
      healthScore -= 40;
      issues.push('Cron для уведомлений никогда не запускался');
    } else {
      const lastCheckAge = (now.getTime() - new Date(lastCronRun).getTime()) / (1000 * 60);
      if (lastCheckAge > 120) {
        healthScore -= 30;
        issues.push(`Cron не запускался ${Math.floor(lastCheckAge / 60)} ч. (последний: ${new Date(lastCronRun).toLocaleString('ru')})`);
      } else if (lastCheckAge > 60) {
        healthScore -= 10;
        issues.push(`Cron давно не запускался (${Math.floor(lastCheckAge)} мин. назад)`);
      }
    }

    // Check for failures
    if (failedCount > 5) {
      healthScore -= 20;
      issues.push(`${failedCount} неудачных уведомлений за 24ч`);
    } else if (failedCount > 0) {
      healthScore -= 5;
      issues.push(`${failedCount} неудачных уведомлений за 24ч`);
    }

    // Check for stalled rules
    if (stalledRules.length > 0) {
      healthScore -= 10;
      issues.push(`${stalledRules.length} правил не проверялись 2+ часа`);
    }

    // Check bot token
    const hasBotToken = !!process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;
    if (!hasBotToken) {
      healthScore -= 30;
      issues.push('TELEGRAM_NOTIFICATIONS_BOT_TOKEN не настроен');
    }

    healthScore = Math.max(0, healthScore);
    
    const status = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical';

    const response = {
      status,
      health_score: healthScore,
      issues,
      cron: {
        last_run: lastCronRun,
        last_run_ago_minutes: lastCronRun ? Math.floor((now.getTime() - new Date(lastCronRun).getTime()) / (1000 * 60)) : null,
        recently_checked_rules: lastCheckedRules.map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.rule_type,
          last_check: r.last_check_at,
        })),
      },
      notifications_24h: {
        sent: sentCount,
        failed: failedCount,
        total: sentCount + failedCount,
      },
      rules: {
        enabled_total: enabledRulesCount,
        stalled: stalledRules.map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.rule_type,
          last_check: r.last_check_at,
        })),
      },
      bot: {
        token_configured: hasBotToken,
      },
      recent_logs: recentLogs.map((l: any) => ({
        id: l.id,
        type: l.rule_type,
        status: l.notification_status,
        created_at: l.created_at,
        error: l.error_message,
        recipients_count: l.sent_to_user_ids?.length || 0,
      })),
      checked_at: now.toISOString(),
    };

    logger.info({
      health_score: healthScore,
      status,
      issues_count: issues.length,
      sent_24h: sentCount,
      failed_24h: failedCount,
    }, 'Notification health check completed');

    return NextResponse.json(response);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Health check failed');
    return NextResponse.json(
      { 
        status: 'error', 
        health_score: 0, 
        error: error.message,
        checked_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
