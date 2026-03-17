import { NextRequest, NextResponse } from 'next/server'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('RegistrationBotWebhook')

async function forwardToHelpDesk(data: {
  telegramUserId: number
  telegramUsername: string | null
  firstName: string
  text: string
  botName: string
}): Promise<boolean> {
  const hdDomain = process.env.HELPDESKEDDY_DOMAIN
  const hdApiKey = process.env.HELPDESKEDDY_API_KEY
  const hdLogin = process.env.HELPDESKEDDY_LOGIN

  if (hdDomain && hdApiKey && hdLogin) {
    try {
      const credentials = Buffer.from(`${hdLogin}:${hdApiKey}`).toString('base64')
      const sender = data.telegramUsername ? `@${data.telegramUsername}` : data.firstName
      const fakeEmail = `telegram_${data.telegramUserId}@telegram.orbo`

      const res = await fetch(`https://${hdDomain}.helpdeskeddy.com/api/v2/tickets`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `[${data.botName}] Сообщение от ${sender}`,
          description: data.text,
          contact_name: data.telegramUsername ? `@${data.telegramUsername} (${data.firstName})` : data.firstName,
          contact_email: fakeEmail
        })
      })
      if (res.ok) return true
    } catch (_) { /* fall through */ }
  }

  const { forwardBotMessage } = await import('@/lib/services/email')
  return (await forwardBotMessage(data)).success
}

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

    const userId = message.from?.id
    const firstName = message.from?.first_name || 'пользователь'
    const tgUsername = message.from?.username || null

    // Handle /start [param]
    if (text.startsWith('/start')) {
      const parts = text.split(' ')
      const startParam = parts[1] || null

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

      if (startParam === 'login') {
        const loginText =
          '🔐 *Вход в Orbo*\n\n' +
          'Нажмите кнопку ниже для входа в ваш аккаунт:'

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: loginText,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                {
                  text: '🔑 Войти в Orbo',
                  web_app: { url: `${appUrl}/tg-app/login` },
                }
              ]]
            }
          }),
        })

        logger.info({
          chat_id: chatId,
          tg_user_id: message.from?.id,
        }, 'Registration bot /start login handled')
      } else {
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
    } else if (userId) {
      // Non-command message → auto-reply + forward to support
      const supportContact = process.env.SUPPORT_CONTACT_TG || 'orbo_support'
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Ваше сообщение получено! Для создания пространства нажмите /start.\n\nЕсли нужна помощь — напишите: @${supportContact}`,
          }),
        })
      } catch (_) { /* ignore */ }

      forwardToHelpDesk({
        telegramUserId: userId,
        telegramUsername: tgUsername,
        firstName,
        text,
        botName: '@orbo_start_bot'
      }).catch(() => {})

      logger.info({ chat_id: chatId, tg_user_id: userId }, 'Registration bot non-command message forwarded to support')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Registration bot webhook error')
    return NextResponse.json({ ok: true })
  }
}
