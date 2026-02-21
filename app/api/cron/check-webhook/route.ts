import { NextRequest, NextResponse } from 'next/server'
import { createCronLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 seconds timeout

/**
 * Cron job для проверки и восстановления Telegram webhook
 * Запускается каждые 30 минут через Vercel Cron
 */
export async function GET(request: NextRequest) {
  const logger = createCronLogger('check-webhook');
  
  try {
    // Проверяем секретный токен для безопасности
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET
    
    if (!expectedToken) {
      logger.error('CRON_SECRET not configured')
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      logger.error('Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      logger.error('NEXT_PUBLIC_APP_URL not configured')
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured' }, { status: 500 })
    }

    const bots: { name: string; token: string; webhookUrl: string; secret?: string; allowedUpdates: string[] }[] = [];

    if (process.env.TELEGRAM_BOT_TOKEN) {
      bots.push({
        name: 'main',
        token: process.env.TELEGRAM_BOT_TOKEN,
        webhookUrl: `${baseUrl}/api/telegram/webhook`,
        secret: process.env.TELEGRAM_WEBHOOK_SECRET,
        allowedUpdates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'message_reaction', 'message_reaction_count', 'my_chat_member', 'chat_member', 'chat_join_request'],
      });
    }

    if (process.env.TELEGRAM_REGISTRATION_BOT_TOKEN) {
      bots.push({
        name: 'registration',
        token: process.env.TELEGRAM_REGISTRATION_BOT_TOKEN,
        webhookUrl: `${baseUrl}/api/telegram/registration-bot/webhook`,
        secret: process.env.TELEGRAM_REGISTRATION_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET,
        allowedUpdates: ['message'],
      });
    }

    if (bots.length === 0) {
      logger.error('No bot tokens configured')
      return NextResponse.json({ error: 'No bot tokens configured' }, { status: 500 })
    }

    logger.info({ bot_count: bots.length }, 'Checking webhook status for all bots')

    const results: Record<string, any> = {};

    for (const bot of bots) {
      try {
        const webhookInfoResponse = await fetch(
          `https://api.telegram.org/bot${bot.token}/getWebhookInfo`,
          { method: 'GET' }
        )

        if (!webhookInfoResponse.ok) {
          results[bot.name] = { status: 'error', error: `Failed to get webhook info: ${webhookInfoResponse.statusText}` };
          continue;
        }

        const webhookInfo = await webhookInfoResponse.json()
        
        if (!webhookInfo.ok) {
          results[bot.name] = { status: 'error', error: webhookInfo.description };
          continue;
        }

        const currentWebhook = webhookInfo.result;

        const needsRestore = 
          currentWebhook.url !== bot.webhookUrl ||
          currentWebhook.last_error_date;

        if (!needsRestore) {
          results[bot.name] = { 
            status: 'healthy',
            url: currentWebhook.url,
            pending_updates: currentWebhook.pending_update_count
          };
          continue;
        }

        logger.info({ bot: bot.name }, 'Restoring webhook');
        
        const setWebhookResponse = await fetch(
          `https://api.telegram.org/bot${bot.token}/setWebhook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              url: bot.webhookUrl,
              ...(bot.secret ? { secret_token: bot.secret } : {}),
              allowed_updates: bot.allowedUpdates,
              max_connections: 40,
              drop_pending_updates: false
            })
          }
        )

        const setWebhookResult = await setWebhookResponse.json();

        if (!setWebhookResult.ok) {
          results[bot.name] = { status: 'restore_failed', error: setWebhookResult.description };
          continue;
        }

        logger.info({ bot: bot.name }, 'Webhook restored successfully');
        results[bot.name] = { 
          status: 'restored',
          previous_url: currentWebhook.url,
          new_url: bot.webhookUrl,
          had_errors: !!currentWebhook.last_error_date,
          last_error: currentWebhook.last_error_message
        };
      } catch (err) {
        results[bot.name] = { status: 'error', error: err instanceof Error ? err.message : String(err) };
      }
    }

    const allHealthy = Object.values(results).every((r: any) => r.status === 'healthy');
    logger.info({ all_healthy: allHealthy, results }, 'Webhook check complete');

    return NextResponse.json(results)

  } catch (error) {
    logger.error({ error }, 'Unexpected error in check-webhook cron')
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

