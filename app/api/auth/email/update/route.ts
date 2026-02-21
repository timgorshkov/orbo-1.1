import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import crypto from 'crypto'
import { createAPILogger } from '@/lib/logger'
import { sendEmail } from '@/lib/services/email'

const supabaseAdmin = createAdminServer()

/**
 * Update email for TG-registered users (replaces placeholder tg{id}@telegram.user).
 * Sends a verification magic link to the new email.
 * When clicked, the existing verify endpoint will match the user by the updated email.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'auth/email/update' })

  try {
    const session = await getUnifiedSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
    }

    const { email } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Некорректный формат email' }, { status: 400 })
    }

    // Check email is not already taken by another user
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingUser && existingUser.id !== session.user.id) {
      return NextResponse.json(
        { error: 'Этот email уже используется другим аккаунтом' },
        { status: 409 }
      )
    }

    // Update user's email from placeholder to real email
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        email: normalizedEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)

    if (updateError) {
      logger.error({ error: updateError.message }, 'Failed to update email')
      return NextResponse.json({ error: 'Не удалось обновить email' }, { status: 500 })
    }

    // Also create/update email account record
    await supabaseAdmin
      .from('accounts')
      .upsert({
        user_id: session.user.id,
        type: 'email',
        provider: 'email',
        provider_account_id: normalizedEmail,
      }, {
        onConflict: 'provider,provider_account_id',
        ignoreDuplicates: true,
      })

    // Generate verification token and send email
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'unknown'

    await supabaseAdmin
      .from('email_auth_tokens')
      .insert({
        token,
        email: normalizedEmail,
        redirect_url: '/welcome?new=1',
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: request.headers.get('user-agent') || 'unknown',
      })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const magicLink = `${baseUrl}/api/auth/email/verify?token=${token}`

    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: 'Подтвердите email в Orbo',
      html: getEmailUpdateTemplate(magicLink, normalizedEmail),
      tags: ['auth', 'email-update'],
    })

    if (!emailResult.success) {
      logger.error({ error: emailResult.error }, 'Failed to send verification email')
      return NextResponse.json(
        { error: 'Не удалось отправить письмо. Попробуйте позже.' },
        { status: 500 }
      )
    }

    logger.info({ email: normalizedEmail, user_id: session.user.id }, 'Email update verification sent')

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Email update failed')
    return NextResponse.json({ error: 'Произошла ошибка' }, { status: 500 })
  }
}

function getEmailUpdateTemplate(magicLink: string, email: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0;">Подтвердите ваш email</h2>
    <p>Нажмите кнопку ниже, чтобы подтвердить email <strong>${email}</strong> и привязать его к вашему аккаунту:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600;">
        Подтвердить email
      </a>
    </div>
    <p style="font-size: 13px; color: #6b7280;">Ссылка действительна 15 минут.</p>
  </div>
</body>
</html>
  `.trim()
}
