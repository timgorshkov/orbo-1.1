import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { verifyTelegramAuthCode } from '@/lib/services/telegramAuthService'
import crypto from 'crypto'

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
          description: `${data.text}\n\n\n---\n\n⚠️ Это автоматический тикет из Telegram. Ответ через HelpDeskEddy пользователю НЕ дойдёт.\nДля ответа: ${data.telegramUsername ? `https://t.me/${data.telegramUsername}` : `суперадминка → пользователь TG ID ${data.telegramUserId} → кнопка «✉️ бот»`}`,
          user_email: fakeEmail
        })
      })
      if (res.ok) return true
    } catch (_) { /* fall through */ }
  }

  const { forwardBotMessage } = await import('@/lib/services/email')
  return (await forwardBotMessage(data)).success
}

/**
 * Проверяет, известен ли Telegram-пользователь системе Orbo:
 * есть ли он как участник (participants.tg_user_id) или как привязанный аккаунт.
 * Используется для фильтрации спам-сообщений от случайных пользователей.
 */
async function isKnownOrbUser(telegramUserId: number): Promise<boolean> {
  const db = createAdminServer()

  const { data: account } = await db
    .from('user_telegram_accounts')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .limit(1)
    .maybeSingle()

  if (account) return true

  const { data: participant } = await db
    .from('participants')
    .select('id')
    .eq('tg_user_id', telegramUserId)
    .is('merged_into', null)
    .limit(1)
    .maybeSingle()

  return !!participant
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

      if (startParam && /^[0-9A-Fa-f]{6}$/.test(startParam)) {
        // Auth code from welcome-screen Telegram linking flow
        logger.info({
          chat_id: chatId,
          tg_user_id: userId,
          code: startParam.toUpperCase(),
        }, 'Registration bot: received auth code via /start')

        const result = await verifyTelegramAuthCode({
          code: startParam.toUpperCase(),
          telegramUserId: userId,
          telegramUsername: tgUsername || undefined,
          firstName: message.from?.first_name || undefined,
          lastName: message.from?.last_name || undefined,
        })

        if (result.success && result.alreadyAuthenticated) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '✅ Telegram подключён к Orbo!\n\nВернитесь в браузер — страница обновится автоматически.',
            }),
          })
          logger.info({ chat_id: chatId, tg_user_id: userId, code: startParam.toUpperCase() }, 'Registration bot: auth code verified, account linked')
        } else if (result.success && result.sessionUrl) {
          // Login flow via registration bot (code was for login, not linking)
          const loginButton = {
            inline_keyboard: [[{ text: '🔑 Войти в Orbo', url: result.sessionUrl }]]
          }
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '🔐 Нажмите кнопку ниже для входа в Orbo:',
              reply_markup: loginButton,
            }),
          })
          logger.info({ chat_id: chatId, tg_user_id: userId, code: startParam.toUpperCase() }, 'Registration bot: auth code verified, login link sent')
        } else {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '❌ Код недействителен или уже использован. Вернитесь в браузер и запросите новый код.',
            }),
          })
          logger.warn({
            chat_id: chatId,
            tg_user_id: userId,
            code: startParam.toUpperCase(),
            error: result.error,
            error_code: result.errorCode,
          }, 'Registration bot: auth code verification failed')
        }
      } else if (startParam === 'login') {
        // Generate a server-side auth code and send a regular URL button.
        // Previously used web_app which breaks for users with Telegram proxy (no VPN).
        // Regular URL button opens in the system browser where the proxy is irrelevant.
        try {
          const db = createAdminServer()

          // Generate unique code (same logic as /api/auth/telegram-code/generate)
          let loginCode = ''
          for (let i = 0; i < 10; i++) {
            const candidate = crypto.randomBytes(3).toString('hex').toUpperCase()
            const { data: existing } = await db
              .from('telegram_auth_codes')
              .select('id')
              .eq('code', candidate)
              .eq('is_used', false)
              .maybeSingle()
            if (!existing) { loginCode = candidate; break }
          }
          if (!loginCode) loginCode = crypto.randomBytes(3).toString('hex').toUpperCase()

          await db.from('telegram_auth_codes').insert({
            code: loginCode,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          })

          const result = await verifyTelegramAuthCode({
            code: loginCode,
            telegramUserId: userId,
            telegramUsername: tgUsername || undefined,
            firstName: message.from?.first_name || undefined,
            lastName: message.from?.last_name || undefined,
          })

          if (result.success && result.sessionUrl) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: '🔐 Нажмите кнопку ниже для входа в Orbo:',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔑 Войти в Orbo', url: result.sessionUrl }]]
                }
              }),
            })
            logger.info({ chat_id: chatId, tg_user_id: userId }, 'Registration bot: login link sent (URL button)')
          } else {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `👋 Аккаунт в Orbo не найден.\n\nЗарегистрируйтесь на сайте и войдите:\n🌐 ${appUrl}/signup`,
              }),
            })
            logger.info({ chat_id: chatId, tg_user_id: userId, error: result.error }, 'Registration bot: login — user not found, sent signup link')
          }
        } catch (err) {
          logger.error({ chat_id: chatId, tg_user_id: userId, error: err instanceof Error ? err.message : String(err) }, 'Registration bot: login flow error')
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `😔 Не удалось создать ссылку для входа. Попробуйте на сайте: ${appUrl}/signin`,
            }),
          })
        }
      } else {
        // Regular URL button instead of web_app — web_app breaks for users with
        // Telegram proxy only (no VPN), as Telegram's WebView ignores proxy settings.
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
                  text: '🌐 Создать пространство',
                  url: `${appUrl}/signup`,
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
      // Non-command message → forward to support only if user is known in Orbo
      const knownUser = await isKnownOrbUser(userId)

      if (!knownUser) {
        logger.info({ chat_id: chatId, tg_user_id: userId }, 'Registration bot: ignoring message from unknown Telegram user (not in Orbo)')
      } else {
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
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Registration bot webhook error')
    return NextResponse.json({ ok: true })
  }
}
