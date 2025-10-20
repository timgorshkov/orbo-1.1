import { NextResponse } from 'next/server';
import { TelegramService } from '@/lib/services/telegramService';
import { webhookRecoveryService } from '@/lib/services/webhookRecoveryService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/telegram/admin/monitor-webhooks
 * Проверяет состояние webhook для обоих ботов и автоматически восстанавливает при необходимости
 * Этот endpoint можно вызывать через GitHub Actions или другой cron service
 */
export async function GET(request: Request) {
  console.log('[Webhook Monitor] ========== MONITORING START ==========');
  
  try {
    const mainBot = new TelegramService('main');
    const notificationsBot = new TelegramService('notifications');

    // Проверяем состояние webhook для обоих ботов
    const [mainWebhookInfo, notificationsWebhookInfo] = await Promise.all([
      mainBot.getWebhookInfo(),
      notificationsBot.getWebhookInfo()
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.orbo.ru';
    const expectedMainUrl = `${baseUrl}/api/telegram/webhook`;
    const expectedNotificationsUrl = `${baseUrl}/api/telegram/notifications/webhook`;

    // Анализируем статус main bot
    const mainStatus = {
      bot: 'main',
      configured: mainWebhookInfo.ok && mainWebhookInfo.result?.url === expectedMainUrl,
      url: mainWebhookInfo.result?.url || null,
      pendingUpdates: mainWebhookInfo.result?.pending_update_count || 0,
      lastError: mainWebhookInfo.result?.last_error_message || null,
      lastErrorDate: mainWebhookInfo.result?.last_error_date || null
    };

    // Анализируем статус notifications bot
    const notificationsStatus = {
      bot: 'notifications',
      configured: notificationsWebhookInfo.ok && notificationsWebhookInfo.result?.url === expectedNotificationsUrl,
      url: notificationsWebhookInfo.result?.url || null,
      pendingUpdates: notificationsWebhookInfo.result?.pending_update_count || 0,
      lastError: notificationsWebhookInfo.result?.last_error_message || null,
      lastErrorDate: notificationsWebhookInfo.result?.last_error_date || null
    };

    console.log('[Webhook Monitor] Main bot status:', mainStatus);
    console.log('[Webhook Monitor] Notifications bot status:', notificationsStatus);

    // Восстановление webhook при необходимости
    const recoveryActions = [];

    // Main bot
    if (!mainStatus.configured) {
      console.log('[Webhook Monitor] 🔧 Main bot webhook misconfigured, attempting recovery');
      const recovered = await webhookRecoveryService.recoverWebhook('main', 'monitoring_detected_misconfiguration');
      recoveryActions.push({
        bot: 'main',
        action: 'recovery_attempted',
        success: recovered
      });
    }

    // Notifications bot
    if (!notificationsStatus.configured) {
      console.log('[Webhook Monitor] 🔧 Notifications bot webhook misconfigured, attempting recovery');
      const recovered = await webhookRecoveryService.recoverWebhook('notifications', 'monitoring_detected_misconfiguration');
      recoveryActions.push({
        bot: 'notifications',
        action: 'recovery_attempted',
        success: recovered
      });
    }

    // Получаем статистику восстановлений
    const recoveryStats = webhookRecoveryService.getRecoveryStats();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      webhooks: {
        main: mainStatus,
        notifications: notificationsStatus
      },
      recoveryActions,
      recoveryStats,
      allConfigured: mainStatus.configured && notificationsStatus.configured
    };

    console.log('[Webhook Monitor] ========== MONITORING COMPLETE ==========');
    console.log('[Webhook Monitor] All webhooks configured:', response.allConfigured);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Webhook Monitor] Error:', error);
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
  console.log('[Webhook Monitor] ========== FORCED RECOVERY START ==========');
  
  try {
    const body = await request.json();
    const { bot } = body; // 'main' | 'notifications' | 'both'

    const results = [];

    if (bot === 'main' || bot === 'both') {
      console.log('[Webhook Monitor] Forcing recovery for main bot');
      const recovered = await webhookRecoveryService.recoverWebhook('main', 'forced_recovery');
      results.push({
        bot: 'main',
        success: recovered
      });
    }

    if (bot === 'notifications' || bot === 'both') {
      console.log('[Webhook Monitor] Forcing recovery for notifications bot');
      const recovered = await webhookRecoveryService.recoverWebhook('notifications', 'forced_recovery');
      results.push({
        bot: 'notifications',
        success: recovered
      });
    }

    console.log('[Webhook Monitor] ========== FORCED RECOVERY COMPLETE ==========');

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error: any) {
    console.error('[Webhook Monitor] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to force recovery',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

