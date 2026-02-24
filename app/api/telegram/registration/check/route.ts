import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { validateInitData } from '@/lib/telegram/webAppAuth'
import { createAPILogger } from '@/lib/logger'

const supabaseAdmin = createAdminServer()

/**
 * Check if a Telegram user already has an Orbo account.
 * Used by the registration MiniApp to determine whether to show the form or a "login" redirect.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/registration/check' })

  try {
    const { initData: initDataString } = await request.json()

    if (!initDataString) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 })
    }

    // Validate against registration bot token first, fall back to community bot
    const regBotToken = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN
    const communityBotToken = process.env.TELEGRAM_BOT_TOKEN!

    let parsed = regBotToken ? validateInitData(initDataString, regBotToken) : null
    if (!parsed) {
      parsed = validateInitData(initDataString, communityBotToken)
    }

    if (!parsed?.user) {
      return NextResponse.json({ error: 'Invalid initData' }, { status: 401 })
    }

    const tgUserId = parsed.user.id

    // Check accounts table only — this is the auth-level link.
    // user_telegram_accounts is org-level (participants from groups), not auth.
    const { data: providerAccount } = await supabaseAdmin
      .from('accounts')
      .select('user_id')
      .eq('provider', 'telegram')
      .eq('provider_account_id', String(tgUserId))
      .maybeSingle()

    const existingUserId = providerAccount?.user_id

    if (existingUserId) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', existingUserId)
        .single()

      let maskedEmail = ''
      const rawEmail = user?.email || ''
      if (rawEmail && !rawEmail.endsWith('@telegram.user')) {
        const [local, domain] = rawEmail.split('@')
        maskedEmail = local.length > 2
          ? `${local[0]}${'*'.repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}@${domain}`
          : `${local[0]}*@${domain}`
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

      return NextResponse.json({
        exists: true,
        maskedEmail,
        loginUrl: `${appUrl}/signin`,
      })
    }

    logger.info({ tg_user_id: tgUserId }, 'New TG user – no existing account')

    return NextResponse.json({ exists: false })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Registration check failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
