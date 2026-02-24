import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { validateInitData } from '@/lib/telegram/webAppAuth'
import { createAPILogger } from '@/lib/logger'
import { encode } from 'next-auth/jwt'

const supabaseAdmin = createAdminServer()

/**
 * Telegram login via MiniApp.
 * Validates initData, finds linked users, and either:
 * - Returns auto-login URL (exactly 1 linked user)
 * - Returns error for 0 or 2+ linked users
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/registration/login' })

  try {
    const { initData: initDataString } = await request.json()

    if (!initDataString) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 })
    }

    const regBotToken = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN
    const communityBotToken = process.env.TELEGRAM_BOT_TOKEN!

    let parsed = regBotToken ? validateInitData(initDataString, regBotToken) : null
    if (!parsed) {
      parsed = validateInitData(initDataString, communityBotToken)
    }

    if (!parsed?.user) {
      return NextResponse.json({ error: 'Invalid initData' }, { status: 401 })
    }

    const tgUser = parsed.user
    const tgUserId = tgUser.id

    // Find registered users linked to this Telegram ID via accounts table only.
    // user_telegram_accounts is org-level (participants), not auth-level.
    const linkedUserIds = new Set<string>()

    const { data: providerAccounts } = await supabaseAdmin
      .from('accounts')
      .select('user_id')
      .eq('provider', 'telegram')
      .eq('provider_account_id', String(tgUserId))

    if (providerAccounts) {
      providerAccounts.forEach(a => linkedUserIds.add(a.user_id))
    }

    const userIds = Array.from(linkedUserIds)

    if (userIds.length === 0) {
      logger.info({ tg_user_id: tgUserId }, 'TG login: no linked accounts')
      return NextResponse.json({
        status: 'not_found',
        message: 'Аккаунт не найден. Зарегистрируйтесь на orbo.ru/signup',
      })
    }

    if (userIds.length > 1) {
      logger.info({ tg_user_id: tgUserId, user_count: userIds.length }, 'TG login: multiple accounts')
      return NextResponse.json({
        status: 'multiple',
        message: 'К этому Telegram привязано несколько аккаунтов. Войдите по email на my.orbo.ru/signin',
        count: userIds.length,
      })
    }

    // Exactly 1 user — authorize
    const userId = userIds[0]

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email, name, image')
      .eq('id', userId)
      .single()

    if (!user) {
      return NextResponse.json({ status: 'not_found', message: 'Пользователь не найден' })
    }

    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
    if (!secret) {
      logger.error({}, 'No NEXTAUTH_SECRET configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
    const cookieName = process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token'

    const jwtToken = await encode({
      token: {
        id: user.id,
        sub: user.id,
        email: user.email,
        name: user.name,
        picture: user.image || tgUser.photo_url || null,
        provider: 'telegram',
      },
      secret,
      salt: cookieName,
      maxAge: 30 * 24 * 60 * 60,
    })

    const loginUrl = `${baseUrl}/api/auth/auto-login?token=${encodeURIComponent(jwtToken)}&redirect=${encodeURIComponent('/orgs')}`

    logger.info({ tg_user_id: tgUserId, user_id: userId }, 'TG login: authorized')

    // Send follow-up bot message with "Open Orbo" button (non-blocking)
    const regBotTokenForMsg = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN
    if (regBotTokenForMsg) {
      fetch(`https://api.telegram.org/bot${regBotTokenForMsg}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgUserId,
          text: `✅ Вы вошли как ${user.name || user.email}.\n\nНажмите кнопку ниже, чтобы перейти в Orbo:`,
          reply_markup: {
            inline_keyboard: [[
              { text: '🚀 Открыть Orbo', url: `${baseUrl}/orgs` },
            ]],
          },
        }),
      }).catch(() => {})
    }

    return NextResponse.json({
      status: 'ok',
      loginUrl,
      userName: user.name,
    })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'TG login failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
