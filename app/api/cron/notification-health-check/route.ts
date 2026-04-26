/**
 * Cron job: Notification System Self-Check
 * 
 * Runs every 6 hours. Checks if the notification system is healthy:
 * - Last successful cron run (check-notification-rules)
 * - Failed notification count
 * - Bot token availability
 * 
 * If issues are detected, sends alert to all superadmins via Telegram.
 * 
 * Authorization: CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createCronLogger } from '@/lib/logger';
import { sendSystemNotification } from '@/lib/services/telegramNotificationService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const logger = createCronLogger('notification-health-check');

  // Authorization check (supports both x-cron-secret header and Bearer token)
  const cronSecret = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isValidSecret = (cronSecret && cronSecret === process.env.CRON_SECRET) || (bearerToken && bearerToken === process.env.CRON_SECRET);
  if (!process.env.CRON_SECRET || !isValidSecret) {
    logger.warn({}, 'Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info({}, 'Notification health self-check started');

  try {
    const adminSupabase = createAdminServer();
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Run checks in parallel
    const [
      lastRuleCheckResult,
      failedNotificationsResult,
      enabledRulesResult,
    ] = await Promise.all([
      // Last rule check time
      adminSupabase
        .from('notification_rules')
        .select('id, name, last_check_at')
        .eq('is_enabled', true)
        .not('last_check_at', 'is', null)
        .order('last_check_at', { ascending: false })
        .limit(1),

      // Failed notifications in last 24h
      adminSupabase
        .from('notification_logs')
        .select('id', { count: 'exact', head: true })
        .eq('notification_status', 'failed')
        .gte('created_at', twentyFourHoursAgo),

      // Enabled rules count
      adminSupabase
        .from('notification_rules')
        .select('id', { count: 'exact', head: true })
        .eq('is_enabled', true),
    ]);

    const issues: string[] = [];
    let severity: 'ok' | 'warning' | 'critical' = 'ok';

    // Check 1: Cron is running
    const lastCheckRules = lastRuleCheckResult.data || [];
    const lastCronRun = lastCheckRules.length > 0 ? lastCheckRules[0].last_check_at : null;

    if (!lastCronRun) {
      issues.push('Cron check-notification-rules никогда не запускался');
      severity = 'critical';
    } else {
      const lastCheckAge = (now.getTime() - new Date(lastCronRun).getTime()) / (1000 * 60 * 60);
      if (lastCheckAge > 6) {
        issues.push(`Cron не запускался ${Math.floor(lastCheckAge)} ч. (последний: ${new Date(lastCronRun).toLocaleString('ru')})`);
        severity = 'critical';
      } else if (lastCheckAge > 3) {
        issues.push(`Cron давно не запускался (${Math.floor(lastCheckAge)} ч. назад)`);
        if (severity === 'ok') severity = 'warning';
      }
    }

    // Check 2: Failed notifications
    const failedCount = failedNotificationsResult.count || 0;
    if (failedCount > 10) {
      issues.push(`${failedCount} неудачных уведомлений за 24ч`);
      severity = 'critical';
    } else if (failedCount > 3) {
      issues.push(`${failedCount} неудачных уведомлений за 24ч`);
      if (severity === 'ok') severity = 'warning';
    }

    // Check 3: Bot token
    const hasBotToken = !!process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;
    if (!hasBotToken) {
      issues.push('TELEGRAM_NOTIFICATIONS_BOT_TOKEN не настроен');
      severity = 'critical';
    }

    // Check 4: Enabled rules exist
    const enabledRulesCount = enabledRulesResult.count || 0;
    if (enabledRulesCount === 0) {
      issues.push('Нет активных правил уведомлений');
      if (severity === 'ok') severity = 'warning';
    }

    logger.info({
      severity,
      issues_count: issues.length,
      last_cron_run: lastCronRun,
      failed_count: failedCount,
      enabled_rules: enabledRulesCount,
      has_bot_token: hasBotToken,
    }, 'Health check results');

    // If there are critical issues, send alert to superadmins
    let alertsSent = 0;
    if (severity === 'critical' && hasBotToken) {
      // Get superadmin telegram IDs
      const { data: superadmins } = await adminSupabase
        .from('superadmins')
        .select('user_id')
        .eq('is_active', true);

      if (superadmins && superadmins.length > 0) {
        const alertMessage = `🚨 *Система уведомлений Orbo — CRITICAL*

Обнаружены критические проблемы:

${issues.map(i => `• ${i}`).join('\n')}

_Проверка: ${now.toLocaleString('ru')}_
_Активных правил: ${enabledRulesCount}_`;

        for (const sa of superadmins) {
          // Get telegram user id for superadmin
          const { data: tgId } = await adminSupabase
            .rpc('get_user_telegram_id', { p_user_id: sa.user_id });

          // Parse RPC result - handle bigint, number, string, object (PostgREST wrapped) types
          let tgUserId: number | null = null;
          if (tgId !== null && tgId !== undefined) {
            if (typeof tgId === 'bigint' || typeof tgId === 'number') {
              tgUserId = Number(tgId);
            } else {
              // For string, object, or any other type - parse from String representation
              const parsed = parseInt(String(tgId), 10);
              tgUserId = isNaN(parsed) ? null : parsed;
            }
          }

          if (tgUserId && !isNaN(tgUserId)) {
            try {
              const result = await sendSystemNotification(tgUserId, alertMessage);
              if (result.success) {
                alertsSent++;
                logger.info({ tg_user_id: tgUserId }, 'Health alert sent to superadmin');
              } else {
                logger.error({ tg_user_id: tgUserId, error: result.error }, 'Failed to send health alert');
              }
            } catch (error) {
              logger.error({ tg_user_id: tgUserId, error }, 'Error sending health alert');
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      severity,
      issues,
      alerts_sent: alertsSent,
      checks: {
        last_cron_run: lastCronRun,
        failed_24h: failedCount,
        enabled_rules: enabledRulesCount,
        bot_token_configured: hasBotToken,
      },
      checked_at: now.toISOString(),
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Health self-check failed');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
