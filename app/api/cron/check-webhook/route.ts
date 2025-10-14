import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 seconds timeout

/**
 * Cron job для проверки и восстановления Telegram webhook
 * Запускается каждые 30 минут через Vercel Cron
 */
export async function GET(request: NextRequest) {
  try {
    // Проверяем секретный токен для безопасности
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET
    
    if (!expectedToken) {
      console.error('[Webhook Cron] CRON_SECRET not configured')
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      console.error('[Webhook Cron] Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`

    if (!botToken) {
      console.error('[Webhook Cron] TELEGRAM_BOT_TOKEN not configured')
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
    }

    if (!webhookUrl || !process.env.NEXT_PUBLIC_APP_URL) {
      console.error('[Webhook Cron] NEXT_PUBLIC_APP_URL not configured')
      return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 })
    }

    console.log('[Webhook Cron] Checking webhook status...')

    // 1. Получаем текущую информацию о webhook
    const webhookInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
      { method: 'GET' }
    )

    if (!webhookInfoResponse.ok) {
      console.error('[Webhook Cron] Failed to get webhook info:', webhookInfoResponse.statusText)
      return NextResponse.json({ 
        error: 'Failed to get webhook info',
        status: webhookInfoResponse.statusText
      }, { status: 500 })
    }

    const webhookInfo = await webhookInfoResponse.json()
    
    if (!webhookInfo.ok) {
      console.error('[Webhook Cron] Telegram API error:', webhookInfo.description)
      return NextResponse.json({ 
        error: 'Telegram API error',
        description: webhookInfo.description
      }, { status: 500 })
    }

    const currentWebhook = webhookInfo.result
    console.log('[Webhook Cron] Current webhook:', {
      url: currentWebhook.url,
      has_custom_certificate: currentWebhook.has_custom_certificate,
      pending_update_count: currentWebhook.pending_update_count,
      last_error_date: currentWebhook.last_error_date,
      last_error_message: currentWebhook.last_error_message
    })

    // 2. Проверяем, нужно ли восстанавливать webhook
    const needsRestore = 
      currentWebhook.url !== webhookUrl || // URL не совпадает
      currentWebhook.last_error_date // Есть ошибки

    if (!needsRestore) {
      console.log('[Webhook Cron] Webhook is healthy, no action needed')
      return NextResponse.json({ 
        status: 'healthy',
        url: currentWebhook.url,
        pending_updates: currentWebhook.pending_update_count
      })
    }

    // 3. Восстанавливаем webhook
    console.log('[Webhook Cron] Restoring webhook...')
    
    const setWebhookResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: webhookUrl,
          max_connections: 40,
          drop_pending_updates: false // Не удаляем необработанные обновления
        })
      }
    )

    if (!setWebhookResponse.ok) {
      console.error('[Webhook Cron] Failed to set webhook:', setWebhookResponse.statusText)
      return NextResponse.json({ 
        error: 'Failed to set webhook',
        status: setWebhookResponse.statusText
      }, { status: 500 })
    }

    const setWebhookResult = await setWebhookResponse.json()

    if (!setWebhookResult.ok) {
      console.error('[Webhook Cron] Telegram API error when setting webhook:', setWebhookResult.description)
      return NextResponse.json({ 
        error: 'Failed to set webhook',
        description: setWebhookResult.description
      }, { status: 500 })
    }

    console.log('[Webhook Cron] ✅ Webhook restored successfully')

    return NextResponse.json({ 
      status: 'restored',
      previous_url: currentWebhook.url,
      new_url: webhookUrl,
      had_errors: !!currentWebhook.last_error_date,
      last_error: currentWebhook.last_error_message
    })

  } catch (error) {
    console.error('[Webhook Cron] Error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

