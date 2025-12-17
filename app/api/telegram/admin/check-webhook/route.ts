import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Простой endpoint для проверки текущего состояния webhook
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/admin/check-webhook' });
  try {
    const password = req.nextUrl.searchParams.get('password')
    
    // Простая защита
    if (password !== process.env.ADMIN_PASSWORD && password !== 'check') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mainBotToken = process.env.TELEGRAM_BOT_TOKEN
    const notificationsBotToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN
    
    const results: any = {
      timestamp: new Date().toISOString(),
      environment: {
        hasMainBotToken: !!mainBotToken,
        hasNotificationsBotToken: !!notificationsBotToken,
        mainBotTokenLength: mainBotToken?.length || 0,
        notificationsBotTokenLength: notificationsBotToken?.length || 0,
        mainWebhookSecretLength: process.env.TELEGRAM_WEBHOOK_SECRET?.length || 0,
        notificationsWebhookSecretLength: process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET?.length || 0,
        appUrl: process.env.NEXT_PUBLIC_APP_URL
      }
    }

    // Проверяем основной бот
    if (mainBotToken) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${mainBotToken}/getWebhookInfo`
        )
        const data = await response.json()
        
        if (data.ok) {
          results.mainBot = {
            url: data.result.url,
            has_custom_certificate: data.result.has_custom_certificate,
            pending_update_count: data.result.pending_update_count,
            last_error_date: data.result.last_error_date,
            last_error_message: data.result.last_error_message,
            max_connections: data.result.max_connections,
            allowed_updates: data.result.allowed_updates,
            // Важно: проверяем совпадение URL
            expectedUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/api/telegram/webhook`,
            urlMatches: data.result.url === `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/api/telegram/webhook`
          }
        } else {
          results.mainBot = { error: data.description }
        }
      } catch (error: any) {
        results.mainBot = { error: error.message }
      }
    }

    // Проверяем бот уведомлений
    if (notificationsBotToken) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${notificationsBotToken}/getWebhookInfo`
        )
        const data = await response.json()
        
        if (data.ok) {
          results.notificationsBot = {
            url: data.result.url,
            has_custom_certificate: data.result.has_custom_certificate,
            pending_update_count: data.result.pending_update_count,
            last_error_date: data.result.last_error_date,
            last_error_message: data.result.last_error_message,
            max_connections: data.result.max_connections,
            allowed_updates: data.result.allowed_updates,
            // Важно: проверяем совпадение URL
            expectedUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/api/telegram/notifications/webhook`,
            urlMatches: data.result.url === `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/api/telegram/notifications/webhook`
          }
        } else {
          results.notificationsBot = { error: data.description }
        }
      } catch (error: any) {
        results.notificationsBot = { error: error.message }
      }
    }

    return NextResponse.json(results, { status: 200 })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error checking webhooks');
    return NextResponse.json(
      { error: error.message || 'Failed to check webhooks' },
      { status: 500 }
    )
  }
}

// DELETE endpoint для удаления webhook
export async function DELETE(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/admin/check-webhook' });
  try {
    const { password, botType } = await req.json()
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: any = {}

    // Удаляем webhook основного бота
    if (!botType || botType === 'main') {
      const mainBotToken = process.env.TELEGRAM_BOT_TOKEN
      if (mainBotToken) {
        const response = await fetch(
          `https://api.telegram.org/bot${mainBotToken}/deleteWebhook`
        )
        const data = await response.json()
        results.mainBot = data
      }
    }

    // Удаляем webhook бота уведомлений
    if (!botType || botType === 'notifications') {
      const notificationsBotToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN
      if (notificationsBotToken) {
        const response = await fetch(
          `https://api.telegram.org/bot${notificationsBotToken}/deleteWebhook`
        )
        const data = await response.json()
        results.notificationsBot = data
      }
    }

    return NextResponse.json({
      success: true,
      results,
      note: 'Webhooks have been deleted. You should set them again.'
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error deleting webhooks');
    return NextResponse.json(
      { error: error.message || 'Failed to delete webhooks' },
      { status: 500 }
    )
  }
}

