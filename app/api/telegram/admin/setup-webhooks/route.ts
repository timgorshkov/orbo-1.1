import { NextResponse } from 'next/server';
import { TelegramService } from '@/lib/services/telegramService';
import { getEventBotToken } from '@/lib/telegram/webAppAuth';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * API для автоматической настройки webhook'ов для обоих ботов
 * GET - проверяет статус webhook'ов
 * POST - устанавливает webhook'и
 */

interface WebhookStatus {
  bot: string;
  configured: boolean;
  url: string | null;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/admin/setup-webhooks' });
  try {
    const mainBot = new TelegramService('main');
    const assistantBot = new TelegramService('notifications');

    // Проверяем статус webhook'ов для обоих ботов
    const [mainWebhookInfo, assistantWebhookInfo] = await Promise.all([
      mainBot.getWebhookInfo(),
      assistantBot.getWebhookInfo()
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    const expectedMainUrl = `${baseUrl}/api/telegram/webhook`;
    const expectedAssistantUrl = `${baseUrl}/api/telegram/notifications/webhook`;
    const expectedEventUrl = `${baseUrl}/api/telegram/event-bot/webhook`;

    const mainStatus: WebhookStatus = {
      bot: 'orbo_community_bot (MAIN)',
      configured: mainWebhookInfo.ok && mainWebhookInfo.result?.url === expectedMainUrl,
      url: mainWebhookInfo.result?.url || null,
      has_custom_certificate: mainWebhookInfo.result?.has_custom_certificate || false,
      pending_update_count: mainWebhookInfo.result?.pending_update_count || 0,
      last_error_date: mainWebhookInfo.result?.last_error_date,
      last_error_message: mainWebhookInfo.result?.last_error_message,
      max_connections: mainWebhookInfo.result?.max_connections,
      allowed_updates: mainWebhookInfo.result?.allowed_updates
    };

    const assistantStatus: WebhookStatus = {
      bot: 'orbo_assistant_bot (ASSISTANT)',
      configured: assistantWebhookInfo.ok && assistantWebhookInfo.result?.url === expectedAssistantUrl,
      url: assistantWebhookInfo.result?.url || null,
      has_custom_certificate: assistantWebhookInfo.result?.has_custom_certificate || false,
      pending_update_count: assistantWebhookInfo.result?.pending_update_count || 0,
      last_error_date: assistantWebhookInfo.result?.last_error_date,
      last_error_message: assistantWebhookInfo.result?.last_error_message,
      max_connections: assistantWebhookInfo.result?.max_connections,
      allowed_updates: assistantWebhookInfo.result?.allowed_updates
    };

    // Check event bot if configured
    let eventStatus: WebhookStatus | null = null;
    const eventBotToken = getEventBotToken();
    if (eventBotToken) {
      try {
        const eventResponse = await fetch(`https://api.telegram.org/bot${eventBotToken}/getWebhookInfo`);
        const eventResult = await eventResponse.json();
        const eventInfo = eventResult.result || {};
        
        eventStatus = {
          bot: 'orbo_event_bot (EVENT)',
          configured: eventInfo.url === expectedEventUrl,
          url: eventInfo.url || null,
          has_custom_certificate: eventInfo.has_custom_certificate || false,
          pending_update_count: eventInfo.pending_update_count || 0,
          last_error_date: eventInfo.last_error_date,
          last_error_message: eventInfo.last_error_message,
          max_connections: eventInfo.max_connections,
          allowed_updates: eventInfo.allowed_updates
        };
      } catch (e) {
        logger.warn({ error: (e as Error).message }, 'Failed to get event bot webhook info');
      }
    }

    const allConfigured = mainStatus.configured && assistantStatus.configured && 
      (eventStatus ? eventStatus.configured : true);

    return NextResponse.json({
      success: true,
      all_configured: allConfigured,
      webhooks: {
        main: mainStatus,
        assistant: assistantStatus,
        ...(eventStatus && { event: eventStatus })
      },
      expected_urls: {
        main: expectedMainUrl,
        assistant: expectedAssistantUrl,
        event: expectedEventUrl
      },
      recommendations: allConfigured 
        ? ['Все webhook\'и настроены правильно ✅']
        : [
            'Некоторые webhook\'и не настроены или настроены неправильно',
            'Выполните POST запрос к этому endpoint для автоматической настройки'
          ]
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error checking webhook status');
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check webhook status'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/admin/setup-webhooks' });
  try {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      return NextResponse.json({
        success: false,
        error: 'TELEGRAM_WEBHOOK_SECRET not configured in environment variables'
      }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    const mainWebhookUrl = `${baseUrl}/api/telegram/webhook`;
    const assistantWebhookUrl = `${baseUrl}/api/telegram/notifications/webhook`;
    const eventWebhookUrl = `${baseUrl}/api/telegram/event-bot/webhook`;

    logger.info({ 
      main_webhook_url: mainWebhookUrl,
      assistant_webhook_url: assistantWebhookUrl,
      event_webhook_url: eventWebhookUrl,
      secret_length: webhookSecret.length
    }, 'Setting up webhooks');

    const mainBot = new TelegramService('main');
    const assistantBot = new TelegramService('notifications');

    // Устанавливаем webhook'и параллельно
    const [mainResult, assistantResult] = await Promise.all([
      mainBot.setWebhookAdvanced({
        url: mainWebhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'chat_member', 'my_chat_member', 'message_reaction'],
        drop_pending_updates: false,
        max_connections: 40
      }),
      assistantBot.setWebhookAdvanced({
        url: assistantWebhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message'],
        drop_pending_updates: false,
        max_connections: 40
      })
    ]);

    const mainSuccess = mainResult.ok;
    const assistantSuccess = assistantResult.ok;
    
    // Setup event bot if configured
    let eventSuccess = true;
    let eventResult: any = null;
    const eventBotToken = getEventBotToken();
    
    if (eventBotToken) {
      try {
        const eventResponse = await fetch(`https://api.telegram.org/bot${eventBotToken}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: eventWebhookUrl,
            allowed_updates: ['message'],
            drop_pending_updates: false,
            max_connections: 40,
          }),
        });
        eventResult = await eventResponse.json();
        eventSuccess = eventResult.ok;
      } catch (e) {
        logger.warn({ error: (e as Error).message }, 'Failed to set event bot webhook');
        eventSuccess = false;
      }
    }

    if (!mainSuccess || !assistantSuccess) {
      return NextResponse.json({
        success: false,
        main_bot: {
          success: mainSuccess,
          description: mainResult.description,
          url: mainWebhookUrl
        },
        assistant_bot: {
          success: assistantSuccess,
          description: assistantResult.description,
          url: assistantWebhookUrl
        },
        event_bot: eventBotToken ? {
          success: eventSuccess,
          description: eventResult?.description,
          url: eventWebhookUrl
        } : { configured: false },
        error: 'Failed to set one or more webhooks'
      }, { status: 500 });
    }

    // Проверяем установку
    const [mainWebhookInfo, assistantWebhookInfo] = await Promise.all([
      mainBot.getWebhookInfo(),
      assistantBot.getWebhookInfo()
    ]);

    return NextResponse.json({
      success: true,
      message: 'Webhooks successfully configured for all bots ✅',
      main_bot: {
        success: mainSuccess,
        url: mainWebhookInfo.result?.url,
        pending_update_count: mainWebhookInfo.result?.pending_update_count
      },
      assistant_bot: {
        success: assistantSuccess,
        url: assistantWebhookInfo.result?.url,
        pending_update_count: assistantWebhookInfo.result?.pending_update_count
      },
      event_bot: eventBotToken ? {
        success: eventSuccess,
        url: eventWebhookUrl
      } : { configured: false },
      secret_configured: true,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error setting up webhooks');
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to set up webhooks'
    }, { status: 500 });
  }
}

