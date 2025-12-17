import { NextResponse } from 'next/server';
import { TelegramService } from '@/lib/services/telegramService';

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

    const allConfigured = mainStatus.configured && assistantStatus.configured;

    return NextResponse.json({
      success: true,
      all_configured: allConfigured,
      webhooks: {
        main: mainStatus,
        assistant: assistantStatus
      },
      expected_urls: {
        main: expectedMainUrl,
        assistant: expectedAssistantUrl
      },
      recommendations: allConfigured 
        ? ['Все webhook\'и настроены правильно ✅']
        : [
            'Некоторые webhook\'и не настроены или настроены неправильно',
            'Выполните POST запрос к этому endpoint для автоматической настройки'
          ]
    });

  } catch (error: any) {
    console.error('Error checking webhook status:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check webhook status'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    console.log('Setting up webhooks...');
    console.log('Main bot URL:', mainWebhookUrl);
    console.log('Assistant bot URL:', assistantWebhookUrl);
    console.log('Secret length:', webhookSecret.length);

    const mainBot = new TelegramService('main');
    const assistantBot = new TelegramService('notifications');

    // Устанавливаем webhook'и параллельно
    const [mainResult, assistantResult] = await Promise.all([
      mainBot.setWebhookAdvanced({
        url: mainWebhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'chat_member', 'my_chat_member'],
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
      message: 'Webhooks successfully configured for both bots ✅',
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
      secret_configured: true,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error setting up webhooks:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to set up webhooks'
    }, { status: 500 });
  }
}

