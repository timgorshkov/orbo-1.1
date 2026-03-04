import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { validateInitData } from '@/lib/telegram/webAppAuth'
import { createAPILogger } from '@/lib/logger'
import crypto from 'crypto'

/**
 * POST /api/telegram/webapp/join-org
 * Body: { initData: string, orgId: string }
 *
 * Validates Telegram initData, checks that the user is a member of the org,
 * creates a pre-verified auth code, and returns a one-time session URL.
 * The user opens the URL in an external browser to get a JWT session cookie.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/webapp/join-org' })

  try {
    const { initData: initDataString, orgId } = await request.json()

    if (!initDataString || !orgId) {
      return NextResponse.json({ error: 'Missing initData or orgId' }, { status: 400 })
    }

    // Validate initData against the community bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      logger.error({}, 'TELEGRAM_BOT_TOKEN not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const parsed = validateInitData(initDataString, botToken)
    if (!parsed?.user) {
      logger.warn({}, 'Invalid initData in join-org')
      return NextResponse.json({ error: 'Invalid initData' }, { status: 401 })
    }

    const tgUser = parsed.user
    const tgUserId = tgUser.id

    const db = createAdminServer()

    // Check org exists
    const { data: org, error: orgError } = await db
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Check user is a member of this org via user_telegram_accounts
    const { data: telegramAccount, error: accountError } = await db
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', tgUserId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (accountError || !telegramAccount) {
      logger.info({ tg_user_id: tgUserId, org_id: orgId }, 'join-org: user not a member of org')
      return NextResponse.json({
        status: 'not_member',
        orgName: org.name,
      })
    }

    // Get user display name
    const { data: user } = await db
      .from('users')
      .select('id, name')
      .eq('id', telegramAccount.user_id)
      .single()

    // Generate unique 6-char code
    let code = ''
    let attempts = 0
    while (attempts < 10) {
      code = crypto.randomBytes(3).toString('hex').toUpperCase()
      const { data: existing } = await db
        .from('telegram_auth_codes')
        .select('id')
        .eq('code', code)
        .eq('is_used', false)
        .maybeSingle()
      if (!existing) break
      attempts++
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    // Insert pre-verified auth code (telegram_user_id already set = ready for handler)
    const { error: insertError } = await db
      .from('telegram_auth_codes')
      .insert({
        code,
        org_id: orgId,
        telegram_user_id: tgUserId,
        telegram_username: tgUser.username || null,
        redirect_url: `/p/${orgId}`,
        is_used: false,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      logger.error({ error: insertError.message }, 'join-org: failed to insert auth code')
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.orbo.ru'
    const sessionUrl = `${baseUrl}/auth/telegram-handler?code=${code}&redirect=${encodeURIComponent(`/p/${orgId}`)}`

    logger.info({ tg_user_id: tgUserId, org_id: orgId, user_id: user?.id }, 'join-org: session URL created')

    return NextResponse.json({
      status: 'ok',
      sessionUrl,
      orgName: org.name,
      userName: user?.name || tgUser.first_name,
    })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'join-org failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
