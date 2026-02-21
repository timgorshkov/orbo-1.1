import { NextRequest, NextResponse } from 'next/server'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('RegistrationBotWebhook')

/**
 * Webhook handler for @orbo_start_bot (registration bot).
 * Handles /start command with optional deep link ref parameter.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = body.message

    if (!message?.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat.id
    const text = message.text.trim()
    const botToken = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN

    if (!botToken) {
      logger.warn({}, 'TELEGRAM_REGISTRATION_BOT_TOKEN not configured')
      return NextResponse.json({ ok: true })
    }

    // Handle /start [ref_campaign]
    if (text.startsWith('/start')) {
      const parts = text.split(' ')
      const startParam = parts[1] || null

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
      const botUsername = process.env.TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot'

      const miniAppUrl = startParam
        ? `https://t.me/${botUsername}/register?startapp=${startParam}`
        : `https://t.me/${botUsername}/register`

      const welcomeText =
        '🚀 *Orbo — платформа для управления сообществами*\n\n' +
        'Регистрация, напоминания, карточки участников, события — всё в одном месте.\n\n' +
        'Нажмите кнопку ниже, чтобы создать пространство:'

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeText,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '📱 Создать пространство',
                web_app: { url: `${appUrl}/tg-app/register` },
              }
            ]]
          }
        }),
      })

      logger.info({
        chat_id: chatId,
        start_param: startParam,
        tg_user_id: message.from?.id,
      }, 'Registration bot /start handled')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Registration bot webhook error')
    return NextResponse.json({ ok: true })
  }
}
