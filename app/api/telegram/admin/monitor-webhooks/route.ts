import { NextResponse } from 'next/server';
import { TelegramService } from '@/lib/services/telegramService';
import { webhookRecoveryService } from '@/lib/services/webhookRecoveryService';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/telegram/admin/monitor-webhooks
 * Проверяет состояние webhook для обоих ботов и автоматически восстанавливает при необходимости
 * Этот endpoint можно вызывать через GitHub Actions или другой cron service
 */
export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/admin/monitor-webhooks' });
  logger.info({}, '[Webhook Monitor] MONITORING START');
  
  try {
    const mainBot = new TelegramService('main');
    const notificationsBot = new TelegramService('notifications');

    const webhookPromises: Promise<any>[] = [
      mainBot.getWebhookInfo(),
      notificationsBot.getWebhookInfo()
    ];

    // Registration bot is optional
    const regBotToken = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN;
    let hasRegBot = false;
    if (regBotToken) {
      hasRegBot = true;
      const regBot = new TelegramService('registration');
      webhookPromises.push(regBot.getWebhookInfo());
    }

    const results = await Promise.all(webhookPromises);
    const [mainWebhookInfo, notificationsWebhookInfo] = results;
    const registrationWebhookInfo = hasRegBot ? results[2] : null;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    const expectedMainUrl = `${baseUrl}/api/telegram/webhook`;
    const expectedNotificationsUrl = `${baseUrl}/api/telegram/notifications/webhook`;
    const expectedRegistrationUrl = `${baseUrl}/api/telegram/registration-bot/webhook`;

    const mainStatus = {
      bot: 'main',
      configured: mainWebhookInfo.ok && mainWebhookInfo.result?.url === expectedMainUrl,
      url: mainWebhookInfo.result?.url || null,
      pendingUpdates: mainWebhookInfo.result?.pending_update_count || 0,
      lastError: mainWebhookInfo.result?.last_error_message || null,
      lastErrorDate: mainWebhookInfo.result?.last_error_date || null
    };

    const notificationsStatus = {
      bot: 'notifications',
      configured: notificationsWebhookInfo.ok && notificationsWebhookInfo.result?.url === expectedNotificationsUrl,
      url: notificationsWebhookInfo.result?.url || null,
      pendingUpdates: notificationsWebhookInfo.result?.pending_update_count || 0,
      lastError: notificationsWebhookInfo.result?.last_error_message || null,
      lastErrorDate: notificationsWebhookInfo.result?.last_error_date || null
    };

    const registrationStatus = hasRegBot ? {
      bot: 'registration',
      configured: registrationWebhookInfo?.ok && registrationWebhookInfo?.result?.url === expectedRegistrationUrl,
      url: registrationWebhookInfo?.result?.url || null,
      pendingUpdates: registrationWebhookInfo?.result?.pending_update_count || 0,
      lastError: registrationWebhookInfo?.result?.last_error_message || null,
      lastErrorDate: registrationWebhookInfo?.result?.last_error_date || null
    } : null;

    logger.debug({ main_status: mainStatus, notifications_status: notificationsStatus, registration_status: registrationStatus }, '[Webhook Monitor] Bot statuses');

    const recoveryActions = [];

    if (!mainStatus.configured) {
      logger.warn({}, '[Webhook Monitor] Main bot webhook misconfigured, attempting recovery');
      const recovered = await webhookRecoveryService.recoverWebhook('main', 'monitoring_detected_misconfiguration');
      recoveryActions.push({ bot: 'main', action: 'recovery_attempted', success: recovered });
    }

    if (!notificationsStatus.configured) {
      logger.warn({}, '[Webhook Monitor] Notifications bot webhook misconfigured, attempting recovery');
      const recovered = await webhookRecoveryService.recoverWebhook('notifications', 'monitoring_detected_misconfiguration');
      recoveryActions.push({ bot: 'notifications', action: 'recovery_attempted', success: recovered });
    }

    if (registrationStatus && !registrationStatus.configured) {
      logger.warn({}, '[Webhook Monitor] Registration bot webhook misconfigured, attempting recovery');
      const recovered = await webhookRecoveryService.recoverWebhook('registration', 'monitoring_detected_misconfiguration');
      recoveryActions.push({ bot: 'registration', action: 'recovery_attempted', success: recovered });
    }

    const recoveryStats = webhookRecoveryService.getRecoveryStats();

    const webhooks: Record<string, any> = {
      main: mainStatus,
      notifications: notificationsStatus
    };
    if (registrationStatus) {
      webhooks.registration = registrationStatus;
    }

    const allConfigured = mainStatus.configured && notificationsStatus.configured && (!registrationStatus || registrationStatus.configured);

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      webhooks,
      recoveryActions,
      recoveryStats,
      allConfigured
    };

    logger.info({ all_configured: response.allConfigured }, '[Webhook Monitor] MONITORING COMPLETE');

    return NextResponse.json(response);

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, '[Webhook Monitor] Error');
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to monitor webhooks',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST /api/telegram/admin/monitor-webhooks
 * Принудительная проверка и восстановление webhook (игнорирует rate limiting)
 */
export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/admin/monitor-webhooks' });
  logger.info({}, '[Webhook Monitor] FORCED RECOVERY START');
  
  try {
    const body = await request.json();
    const { bot } = body; // 'main' | 'notifications' | 'registration' | 'both' | 'all'

    const results = [];

    if (bot === 'main' || bot === 'both' || bot === 'all') {
      logger.info({ bot: 'main' }, '[Webhook Monitor] Forcing recovery for main bot');
      const recovered = await webhookRecoveryService.recoverWebhook('main', 'forced_recovery');
      results.push({ bot: 'main', success: recovered });
    }

    if (bot === 'notifications' || bot === 'both' || bot === 'all') {
      logger.info({ bot: 'notifications' }, '[Webhook Monitor] Forcing recovery for notifications bot');
      const recovered = await webhookRecoveryService.recoverWebhook('notifications', 'forced_recovery');
      results.push({ bot: 'notifications', success: recovered });
    }

    if ((bot === 'registration' || bot === 'all') && process.env.TELEGRAM_REGISTRATION_BOT_TOKEN) {
      logger.info({ bot: 'registration' }, '[Webhook Monitor] Forcing recovery for registration bot');
      const recovered = await webhookRecoveryService.recoverWebhook('registration', 'forced_recovery');
      results.push({ bot: 'registration', success: recovered });
    }

    logger.info({ results }, '[Webhook Monitor] FORCED RECOVERY COMPLETE');

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, '[Webhook Monitor] Error');
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to force recovery',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

