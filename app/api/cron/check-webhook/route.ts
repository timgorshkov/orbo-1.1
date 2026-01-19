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

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`

    if (!botToken) {
      logger.error('TELEGRAM_BOT_TOKEN not configured')
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
    }

    if (!webhookUrl || !process.env.NEXT_PUBLIC_APP_URL) {
      logger.error('NEXT_PUBLIC_APP_URL not configured')
      return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 })
    }

    logger.info('Checking webhook status')

    // 1. Получаем текущую информацию о webhook
    const webhookInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
      { method: 'GET' }
    )

    if (!webhookInfoResponse.ok) {
      logger.error({ status: webhookInfoResponse.statusText }, 'Failed to get webhook info')
      return NextResponse.json({ 
        error: 'Failed to get webhook info',
        status: webhookInfoResponse.statusText
      }, { status: 500 })
    }

    const webhookInfo = await webhookInfoResponse.json()
    
    if (!webhookInfo.ok) {
      logger.error({ description: webhookInfo.description }, 'Telegram API error')
      return NextResponse.json({ 
        error: 'Telegram API error',
        description: webhookInfo.description
      }, { status: 500 })
    }

    const currentWebhook = webhookInfo.result
    logger.info({
      url: currentWebhook.url,
      has_custom_certificate: currentWebhook.has_custom_certificate,
      pending_update_count: currentWebhook.pending_update_count,
      last_error_date: currentWebhook.last_error_date,
      last_error_message: currentWebhook.last_error_message
    }, 'Current webhook status')

    // 2. Проверяем, нужно ли восстанавливать webhook
    const needsRestore = 
      currentWebhook.url !== webhookUrl || // URL не совпадает
      currentWebhook.last_error_date // Есть ошибки

    if (!needsRestore) {
      logger.info({ 
        url: currentWebhook.url,
        pending_updates: currentWebhook.pending_update_count
      }, 'Webhook is healthy')
      return NextResponse.json({ 
        status: 'healthy',
        url: currentWebhook.url,
        pending_updates: currentWebhook.pending_update_count
      })
    }

    // 3. Восстанавливаем webhook
    logger.info('Restoring webhook')
    
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    
    const setWebhookResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: webhookUrl,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'message_reaction', 'my_chat_member', 'chat_member'],
          max_connections: 40,
          drop_pending_updates: false // Не удаляем необработанные обновления
        })
      }
    )

    if (!setWebhookResponse.ok) {
      logger.error({ status: setWebhookResponse.statusText }, 'Failed to set webhook')
      return NextResponse.json({ 
        error: 'Failed to set webhook',
        status: setWebhookResponse.statusText
      }, { status: 500 })
    }

    const setWebhookResult = await setWebhookResponse.json()

    if (!setWebhookResult.ok) {
      logger.error({ description: setWebhookResult.description }, 'Telegram API error when setting webhook')
      return NextResponse.json({ 
        error: 'Failed to set webhook',
        description: setWebhookResult.description
      }, { status: 500 })
    }

    logger.info('Webhook restored successfully')

    return NextResponse.json({ 
      status: 'restored',
      previous_url: currentWebhook.url,
      new_url: webhookUrl,
      had_errors: !!currentWebhook.last_error_date,
      last_error: currentWebhook.last_error_message
    })

  } catch (error) {
    logger.error({ error }, 'Unexpected error in check-webhook cron')
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

