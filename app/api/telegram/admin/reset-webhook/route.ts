import { NextRequest, NextResponse } from 'next/server'
import { createTelegramService, telegramFetch } from '@/lib/services/telegramService'
import { buildWebhookUrl } from '@/lib/telegram/webhookRelay'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Защищенный endpoint для переустановки webhook
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/admin/reset-webhook' });
  try {
    // Простая защита - требуем пароль
    const { password, botType } = await req.json()
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: any = {}

    // Переустанавливаем основной бот
    if (!botType || botType === 'main') {
      const mainBotToken = process.env.TELEGRAM_BOT_TOKEN
      const mainWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

      if (mainBotToken && mainWebhookSecret) {
        const mainService = createTelegramService('main')
        const webhookUrl = buildWebhookUrl('main')
        
        // Получаем текущую информацию о webhook
        const infoResponse = await telegramFetch(
          `https://api.telegram.org/bot${mainBotToken}/getWebhookInfo`
        )
        const currentInfo = await infoResponse.json()
        
        // Устанавливаем новый webhook
        const setResult = await mainService.setWebhook(webhookUrl, mainWebhookSecret)
        
        results.main = {
          previousWebhook: currentInfo.result,
          newWebhook: setResult,
          webhookUrl,
          secretLength: mainWebhookSecret.length
        }
      } else {
        results.main = { error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET' }
      }
    }

    // Переустанавливаем бот уведомлений
    if (!botType || botType === 'notifications') {
      const notificationsBotToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN
      const notificationsWebhookSecret = 
        process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || 
        process.env.TELEGRAM_WEBHOOK_SECRET

      if (notificationsBotToken && notificationsWebhookSecret) {
        const notificationsService = createTelegramService('notifications')
        const webhookUrl = buildWebhookUrl('notifications')
        
        // Получаем текущую информацию о webhook
        const infoResponse = await telegramFetch(
          `https://api.telegram.org/bot${notificationsBotToken}/getWebhookInfo`
        )
        const currentInfo = await infoResponse.json()
        
        // Устанавливаем новый webhook
        const setResult = await notificationsService.setWebhook(
          webhookUrl, 
          notificationsWebhookSecret
        )
        
        results.notifications = {
          previousWebhook: currentInfo.result,
          newWebhook: setResult,
          webhookUrl,
          secretLength: notificationsWebhookSecret.length
        }
      } else {
        results.notifications = { 
          error: 'Missing TELEGRAM_NOTIFICATIONS_BOT_TOKEN or webhook secret' 
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      note: 'Webhooks have been reset with current environment variables'
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error resetting webhooks');
    return NextResponse.json(
      { error: 'Failed to reset webhooks' },
      { status: 500 }
    )
  }
}

// GET endpoint для проверки текущего состояния webhooks
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/admin/reset-webhook' });
  try {
    const authHeader = req.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const queryPassword = req.nextUrl.searchParams.get('password')
    const password = bearerToken || queryPassword
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: any = {}

    // Проверяем основной бот
    const mainBotToken = process.env.TELEGRAM_BOT_TOKEN
    if (mainBotToken) {
      const infoResponse = await fetch(
        `https://api.telegram.org/bot${mainBotToken}/getWebhookInfo`
      )
      const info = await infoResponse.json()
      
      results.main = {
        webhook: info.result,
        expectedSecretLength: process.env.TELEGRAM_WEBHOOK_SECRET?.length || 0,
        expectedUrl: buildWebhookUrl('main')
      }
    }

    // Проверяем бот уведомлений
    const notificationsBotToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN
    if (notificationsBotToken) {
      const infoResponse = await fetch(
        `https://api.telegram.org/bot${notificationsBotToken}/getWebhookInfo`
      )
      const info = await infoResponse.json()
      
      results.notifications = {
        webhook: info.result,
        expectedSecretLength: (
          process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET ||
          process.env.TELEGRAM_WEBHOOK_SECRET
        )?.length || 0,
        expectedUrl: buildWebhookUrl('notifications')
      }
    }

    return NextResponse.json({
      results,
      envVars: {
        hasMainBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
        hasNotificationsBotToken: !!process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN,
        hasWebhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
        hasNotificationsWebhookSecret: !!process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET,
        appUrl: process.env.NEXT_PUBLIC_APP_URL
      }
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error checking webhooks');
    return NextResponse.json(
      { error: 'Failed to check webhooks' },
      { status: 500 }
    )
  }
}

