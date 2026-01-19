import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { getEventBotToken } from '@/lib/telegram/webAppAuth';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * API endpoint to manually setup Telegram webhook
 * Only accessible by superadmins
 * ⚡ ОБНОВЛЕНО: Использует unified auth для поддержки OAuth
 */
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/telegram/setup-webhook' });
  
  try {
    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check superadmin status using admin client (bypass RLS)
    const supabaseAdmin = createAdminServer();
    const { data: superadmin, error: superadminError } = await supabaseAdmin
      .from('superadmins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (superadminError || !superadmin) {
      logger.warn({ 
        user_id: user.id,
        error: superadminError?.message
      }, 'Access denied');
      return NextResponse.json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
    }

    // Get bot type from request
    const { botType, dropPendingUpdates = false } = await req.json();
    
    if (!botType || !['main', 'notifications', 'event'].includes(botType)) {
      return NextResponse.json({ error: 'Invalid botType. Must be "main", "notifications", or "event"' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    
    // Handle Event Bot separately (uses different token)
    if (botType === 'event') {
      const eventBotToken = getEventBotToken();
      if (!eventBotToken) {
        return NextResponse.json({ error: 'TELEGRAM_EVENT_BOT_TOKEN not configured' }, { status: 500 });
      }
      
      const webhookUrl = `${baseUrl}/api/telegram/event-bot/webhook`;
      
      logger.info({ bot_type: botType, webhook_url: webhookUrl }, 'Setting event bot webhook');
      
      const response = await fetch(`https://api.telegram.org/bot${eventBotToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message'],
          drop_pending_updates: dropPendingUpdates,
          max_connections: 40,
        }),
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        logger.error({ error: result.description }, 'Failed to set event bot webhook');
        return NextResponse.json({ error: result.description || 'Failed to set webhook' }, { status: 500 });
      }
      
      // Get webhook info
      const infoResponse = await fetch(`https://api.telegram.org/bot${eventBotToken}/getWebhookInfo`);
      const infoResult = await infoResponse.json();
      const webhookInfo = infoResult.result || {};
      
      return NextResponse.json({
        success: true,
        botType,
        webhook: {
          url: webhookInfo.url || '',
          hasCustomCertificate: webhookInfo.has_custom_certificate || false,
          pendingUpdateCount: webhookInfo.pending_update_count || 0,
          lastErrorDate: webhookInfo.last_error_date,
          lastErrorMessage: webhookInfo.last_error_message,
          maxConnections: webhookInfo.max_connections || 40,
          allowedUpdates: webhookInfo.allowed_updates || []
        }
      });
    }

    // Setup webhook for main/notifications bots
    const webhookSecret = botType === 'notifications'
      ? (process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET)
      : process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const webhookUrl = botType === 'main'
      ? `${baseUrl}/api/telegram/webhook`
      : `${baseUrl}/api/telegram/notifications/webhook`;

    logger.info({ bot_type: botType, webhook_url: webhookUrl }, 'Setting webhook');

    const telegramService = new TelegramService(botType);

    // Set webhook with all required updates
    const result = await telegramService.setWebhookAdvanced({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: botType === 'main'
        ? ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'message_reaction', 'my_chat_member', 'chat_member']
        : ['message'],
      drop_pending_updates: dropPendingUpdates,
      max_connections: 40
    });
    
    logger.info({ 
      bot_type: botType, 
      drop_pending: dropPendingUpdates 
    }, 'Webhook configuration request');

    if (!result.ok) {
      logger.error({ 
        bot_type: botType,
        error: result.description || 'Unknown error'
      }, 'Failed to set webhook');
      return NextResponse.json({
        error: 'Failed to set webhook',
        details: result.description || 'Unknown error'
      }, { status: 500 });
    }

    logger.info({ bot_type: botType }, 'Webhook successfully set');

    // Get webhook info to verify
    const webhookResponse = await telegramService.getWebhookInfo();
    const webhookInfo = webhookResponse.result || webhookResponse;

    return NextResponse.json({
      success: true,
      botType,
      webhook: {
        url: webhookInfo.url || '',
        hasCustomCertificate: webhookInfo.has_custom_certificate || false,
        pendingUpdateCount: webhookInfo.pending_update_count || 0,
        lastErrorDate: webhookInfo.last_error_date,
        lastErrorMessage: webhookInfo.last_error_message,
        maxConnections: webhookInfo.max_connections || 40,
        allowedUpdates: webhookInfo.allowed_updates || []
      }
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error setting webhook');
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Get current webhook info
 * ⚡ ОБНОВЛЕНО: Использует unified auth для поддержки OAuth
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/telegram/setup-webhook' });
  
  try {
    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check superadmin status using admin client (bypass RLS)
    const supabaseAdmin = createAdminServer();
    const { data: superadmin, error: superadminError } = await supabaseAdmin
      .from('superadmins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (superadminError || !superadmin) {
      logger.warn({ 
        user_id: user.id,
        error: superadminError?.message
      }, 'Access denied');
      return NextResponse.json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
    }

    // Get webhook info for all bots
    const mainService = new TelegramService('main');
    const notificationsService = new TelegramService('notifications');
    
    // Get event bot info (if configured)
    const eventBotToken = getEventBotToken();
    let eventBotInfo: any = null;
    
    if (eventBotToken) {
      try {
        const eventResponse = await fetch(`https://api.telegram.org/bot${eventBotToken}/getWebhookInfo`);
        const eventResult = await eventResponse.json();
        eventBotInfo = eventResult.result || {};
        
        // Also get bot info for username
        const meResponse = await fetch(`https://api.telegram.org/bot${eventBotToken}/getMe`);
        const meResult = await meResponse.json();
        if (meResult.result) {
          eventBotInfo.botUsername = meResult.result.username;
        }
      } catch (e) {
        logger.warn({ error: (e as Error).message }, 'Failed to get event bot info');
      }
    }

    const [mainResponse, notificationsResponse] = await Promise.all([
      mainService.getWebhookInfo(),
      notificationsService.getWebhookInfo()
    ]);

    // Extract result from Telegram API response
    const mainInfo = mainResponse.result || mainResponse;
    const notificationsInfo = notificationsResponse.result || notificationsResponse;

    return NextResponse.json({
      main: {
        url: mainInfo.url || '',
        hasCustomCertificate: mainInfo.has_custom_certificate || false,
        pendingUpdateCount: mainInfo.pending_update_count || 0,
        lastErrorDate: mainInfo.last_error_date,
        lastErrorMessage: mainInfo.last_error_message,
        maxConnections: mainInfo.max_connections || 40,
        allowedUpdates: mainInfo.allowed_updates || []
      },
      notifications: {
        url: notificationsInfo.url || '',
        hasCustomCertificate: notificationsInfo.has_custom_certificate || false,
        pendingUpdateCount: notificationsInfo.pending_update_count || 0,
        lastErrorDate: notificationsInfo.last_error_date,
        lastErrorMessage: notificationsInfo.last_error_message,
        maxConnections: notificationsInfo.max_connections || 40,
        allowedUpdates: notificationsInfo.allowed_updates || []
      },
      event: eventBotToken ? {
        configured: true,
        botUsername: eventBotInfo?.botUsername || 'orbo_event_bot',
        url: eventBotInfo?.url || '',
        hasCustomCertificate: eventBotInfo?.has_custom_certificate || false,
        pendingUpdateCount: eventBotInfo?.pending_update_count || 0,
        lastErrorDate: eventBotInfo?.last_error_date,
        lastErrorMessage: eventBotInfo?.last_error_message,
        maxConnections: eventBotInfo?.max_connections || 40,
        allowedUpdates: eventBotInfo?.allowed_updates || []
      } : {
        configured: false,
        message: 'TELEGRAM_EVENT_BOT_TOKEN not set'
      }
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error getting webhook info');
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    }, { status: 500 });
  }
}

