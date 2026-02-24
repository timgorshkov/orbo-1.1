import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { validateInitData } from '@/lib/telegram/webAppAuth'
import { createAPILogger } from '@/lib/logger'
import { encode } from 'next-auth/jwt'
import crypto from 'crypto'
import { sendEmail } from '@/lib/services/email'
import { scheduleOnboardingChain } from '@/lib/services/onboardingChainService'

const supabaseAdmin = createAdminServer()

/**
 * Create a new user + org from the registration MiniApp.
 * Validates Telegram initData, creates user/account/org/membership,
 * sends email verification, generates auto-login token.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/registration/create' })

  try {
    const { initData: initDataString, email, campaignRef } = await request.json()

    if (!initDataString || !email) {
      return NextResponse.json({ error: 'Заполните email' }, { status: 400 })
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
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await supabaseAdmin
      .from('email_auth_tokens')
      .insert({
        token,
        email: normalizedEmail,
        redirect_url: '/welcome?tg=1&verified=1',
        expires_at: expiresAt.toISOString(),
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
      })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
    const magicLink = `${baseUrl}/api/auth/email/verify?token=${token}`

    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: 'Подтвердите email — Orbo',
      html: getVerificationEmailTemplate(magicLink, normalizedEmail, fullName),
      tags: ['registration', 'miniapp', 'verification'],
    })

    if (!emailResult.success) {
      logger.error({ error: emailResult.error, email: normalizedEmail }, 'Failed to send verification email')
    }

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

      loginUrl = `${baseUrl}/api/auth/auto-login?token=${encodeURIComponent(jwtToken)}&redirect=${encodeURIComponent('/welcome?tg=1&new=1')}`
    }

    // --- CRM integration (non-blocking) ---
    import('@/lib/services/weeekService').then(({ ensureCrmRecord }) => {
      ensureCrmRecord(userId, normalizedEmail, fullName).catch(() => {})
    }).catch(() => {})

    scheduleOnboardingChain(userId, 'telegram').catch(() => {})

    // --- Send bot message with "Open Orbo" button (non-blocking) ---
    const regBotTokenForMsg = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN
    if (regBotTokenForMsg) {
      fetch(`https://api.telegram.org/bot${regBotTokenForMsg}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgUserId,
          text: `🎉 Аккаунт создан, ${fullName}!\n\nНажмите кнопку ниже, чтобы перейти в Orbo и настроить своё пространство:`,
          reply_markup: {
            inline_keyboard: [[
              { text: '🚀 Открыть Orbo', url: `${baseUrl}/orgs` },
            ]],
          },
        }),
      }).catch(() => {})
    }

    logger.info({
      user_id: userId,
      email: normalizedEmail,
      tg_user_id: tgUserId,
      campaign_ref: campaignRef,
      email_sent: emailResult.success,
    }, 'MiniApp registration complete')

    return NextResponse.json({
      success: true,
      loginUrl,
      userId,
      emailSent: emailResult.success,
    })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'MiniApp registration failed')
    return NextResponse.json({ error: 'Произошла ошибка' }, { status: 500 })
  }
}

function getVerificationEmailTemplate(magicLink: string, email: string, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  <div style="background: #fff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Подтвердите email</h2>
    <p>${userName}, подтвердите ваш email для завершения регистрации в Orbo:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600;">
        Подтвердить email
      </a>
    </div>
    <p style="font-size: 13px; color: #6b7280;">Ссылка действительна 24 часа. Если вы не регистрировались — просто проигнорируйте это письмо.</p>
    <p style="font-size: 12px; color: #9ca3af; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
      Если кнопка не работает, скопируйте ссылку:<br>
      <a href="${magicLink}" style="color: #667eea; word-break: break-all;">${magicLink}</a>
    </p>
  </div>
</body>
</html>
  `.trim()
}
