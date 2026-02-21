import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { validateInitData } from '@/lib/telegram/webAppAuth'
import { createAPILogger } from '@/lib/logger'
import { encode } from 'next-auth/jwt'
import crypto from 'crypto'
import { sendEmail } from '@/lib/services/email'

const supabaseAdmin = createAdminServer()

/**
 * Create a new user + org from the registration MiniApp.
 * Validates Telegram initData, creates user/account/org/membership,
 * sends email verification, generates auto-login token.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/registration/create' })

  try {
    const { initData: initDataString, email, orgName, campaignRef } = await request.json()

    if (!initDataString || !email || !orgName) {
      return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 })
    }

    // Validate initData
    const regBotToken = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN
    const communityBotToken = process.env.TELEGRAM_BOT_TOKEN!

    let parsed = regBotToken ? validateInitData(initDataString, regBotToken) : null
    if (!parsed) {
      parsed = validateInitData(initDataString, communityBotToken)
    }

    if (!parsed?.user) {
      return NextResponse.json({ error: 'Ошибка авторизации Telegram' }, { status: 401 })
    }

    const tgUser = parsed.user
    const tgUserId = tgUser.id
    const fullName = `${tgUser.first_name}${tgUser.last_name ? ' ' + tgUser.last_name : ''}`

    // Check email not taken
    const { data: emailUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (emailUser) {
      return NextResponse.json(
        { error: 'Этот email уже зарегистрирован. Войдите через my.orbo.ru' },
        { status: 409 }
      )
    }

    // Double-check TG account doesn't already exist
    const { data: existingTg } = await supabaseAdmin
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', tgUserId)
      .eq('is_verified', true)
      .maybeSingle()

    if (existingTg) {
      return NextResponse.json(
        { error: 'Telegram-аккаунт уже привязан. Войдите через my.orbo.ru' },
        { status: 409 }
      )
    }

    // --- Create user ---
    const userId = crypto.randomUUID()

    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        email: normalizedEmail,
        name: fullName,
        image: tgUser.photo_url || null,
        email_verified: null, // will be verified via email
      })

    if (userError) {
      logger.error({ error: userError.message }, 'Failed to create user')
      return NextResponse.json({ error: 'Не удалось создать аккаунт' }, { status: 500 })
    }

    // --- Create account record ---
    await supabaseAdmin
      .from('accounts')
      .insert({
        user_id: userId,
        type: 'oauth',
        provider: 'telegram',
        provider_account_id: String(tgUserId),
      })

    // --- Create organization ---
    const orgId = crypto.randomUUID()

    await supabaseAdmin
      .from('organizations')
      .insert({
        id: orgId,
        name: orgName.trim(),
        owner_id: userId,
        status: 'active',
      })

    // --- Create membership ---
    await supabaseAdmin
      .from('memberships')
      .insert({
        org_id: orgId,
        user_id: userId,
        role: 'owner',
      })

    // --- Link telegram account ---
    await supabaseAdmin
      .from('user_telegram_accounts')
      .upsert({
        user_id: userId,
        org_id: orgId,
        telegram_user_id: tgUserId,
        telegram_username: tgUser.username || null,
        telegram_first_name: tgUser.first_name,
        telegram_last_name: tgUser.last_name || null,
        is_verified: true,
        verified_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,org_id',
        ignoreDuplicates: false,
      })

    // --- Save campaign ref ---
    if (campaignRef) {
      await supabaseAdmin
        .from('users')
        .update({
          metadata: { campaign_ref: campaignRef, registered_via: 'miniapp' },
        })
        .eq('id', userId)
    }

    // --- Send email verification ---
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await supabaseAdmin
      .from('email_auth_tokens')
      .insert({
        token,
        email: normalizedEmail,
        redirect_url: `/app/${orgId}`,
        expires_at: expiresAt.toISOString(),
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
      })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
    const magicLink = `${baseUrl}/api/auth/email/verify?token=${token}`

    await sendEmail({
      to: normalizedEmail,
      subject: 'Добро пожаловать в Orbo!',
      html: getWelcomeEmailTemplate(magicLink, normalizedEmail, orgName.trim()),
      tags: ['registration', 'miniapp'],
    }).catch(err => {
      logger.warn({ error: err?.message }, 'Failed to send welcome email (non-blocking)')
    })

    // --- Generate auto-login JWT ---
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
    let loginUrl = `${baseUrl}/signin`

    if (secret) {
      const cookieName = process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token'

      const jwtToken = await encode({
        token: {
          id: userId,
          sub: userId,
          email: normalizedEmail,
          name: fullName,
          picture: tgUser.photo_url || null,
          provider: 'telegram',
        },
        secret,
        salt: cookieName,
        maxAge: 30 * 24 * 60 * 60,
      })

      // Use a one-time auto-login endpoint
      loginUrl = `${baseUrl}/api/auth/auto-login?token=${encodeURIComponent(jwtToken)}&redirect=${encodeURIComponent(`/app/${orgId}`)}`
    }

    // --- CRM integration (non-blocking) ---
    import('@/lib/services/weeekService').then(({ ensureCrmRecord }) => {
      ensureCrmRecord(userId, normalizedEmail, fullName).catch(() => {})
    }).catch(() => {})

    logger.info({
      user_id: userId,
      org_id: orgId,
      email: normalizedEmail,
      tg_user_id: tgUserId,
      campaign_ref: campaignRef,
    }, 'MiniApp registration complete')

    return NextResponse.json({
      success: true,
      loginUrl,
      userId,
      orgId,
    })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'MiniApp registration failed')
    return NextResponse.json({ error: 'Произошла ошибка' }, { status: 500 })
  }
}

function getWelcomeEmailTemplate(magicLink: string, email: string, orgName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  <div style="background: #fff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Добро пожаловать!</h2>
    <p>Ваше пространство <strong>${orgName}</strong> создано. Подтвердите email и начните работу:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600;">
        Подтвердить email и войти
      </a>
    </div>
    <p style="font-size: 13px; color: #6b7280;">Ссылка действительна 1 час.</p>
  </div>
</body>
</html>
  `.trim()
}
