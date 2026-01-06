import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import crypto from 'crypto'
import { createAPILogger } from '@/lib/logger'
import { sendEmail } from '@/lib/services/email'

const supabaseAdmin = createAdminServer()

/**
 * Запрос magic link для авторизации по email
 * 
 * POST /api/auth/email/request
 * Body: { email: string, redirectUrl?: string }
 * 
 * Генерирует токен, сохраняет в БД и отправляет magic link через Unisender Go
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'auth/email/request' })
  
  try {
    const body = await request.json()
    const { email, redirectUrl } = body
    
    // Валидация email
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 })
    }
    
    const normalizedEmail = email.toLowerCase().trim()
    
    // Простая валидация формата email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Некорректный формат email' }, { status: 400 })
    }
    
    logger.info({ email: normalizedEmail }, 'Email auth request received')
    
    // Rate limiting: проверяем количество запросов за последний час
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await supabaseAdmin
      .from('email_auth_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .gte('created_at', oneHourAgo)
    
    if (countError) {
      logger.error({ error: countError.message }, 'Failed to check rate limit')
    } else if (count && count >= 5) {
      logger.warn({ email: normalizedEmail, count }, 'Rate limit exceeded')
      return NextResponse.json(
        { error: 'Слишком много запросов. Попробуйте позже.' },
        { status: 429 }
      )
    }
    
    // Генерируем криптографически безопасный токен
    const token = crypto.randomBytes(32).toString('hex')
    
    // Срок действия: 15 минут
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    
    // Получаем IP и User Agent
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() 
      || request.headers.get('x-real-ip') 
      || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    
    // Сохраняем токен в БД
    const { error: insertError } = await supabaseAdmin
      .from('email_auth_tokens')
      .insert({
        token,
        email: normalizedEmail,
        redirect_url: redirectUrl || '/orgs',
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent
      })
    
    if (insertError) {
      logger.error({ error: insertError.message }, 'Failed to save auth token')
      return NextResponse.json(
        { error: 'Ошибка при создании токена авторизации' },
        { status: 500 }
      )
    }
    
    // Формируем magic link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const magicLink = `${baseUrl}/api/auth/email/verify?token=${token}`
    
    // Отправляем email через Unisender Go
    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: 'Вход в Orbo',
      html: getMagicLinkEmailTemplate(magicLink, normalizedEmail),
      tags: ['auth', 'magic-link']
    })
    
    if (!emailResult.success) {
      logger.error({ 
        error: emailResult.error, 
        email: normalizedEmail 
      }, 'Failed to send magic link email')
      
      // Удаляем токен если email не отправился
      await supabaseAdmin
        .from('email_auth_tokens')
        .delete()
        .eq('token', token)
      
      return NextResponse.json(
        { error: 'Не удалось отправить письмо. Попробуйте позже.' },
        { status: 500 }
      )
    }
    
    logger.info({ 
      email: normalizedEmail,
      message_id: emailResult.messageId,
      expires_at: expiresAt.toISOString()
    }, 'Magic link sent successfully')
    
    return NextResponse.json({
      success: true,
      message: 'Ссылка для входа отправлена на ваш email',
      // В dev режиме показываем ссылку для тестирования
      ...(process.env.NODE_ENV === 'development' && { dev_link: magicLink })
    })
    
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Email auth request failed')
    
    return NextResponse.json(
      { error: 'Произошла ошибка при отправке письма' },
      { status: 500 }
    )
  }
}

/**
 * HTML шаблон письма с magic link
 */
function getMagicLinkEmailTemplate(magicLink: string, email: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Вход в Orbo</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0; margin-bottom: 20px;">Вход в аккаунт</h2>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      Нажмите кнопку ниже, чтобы войти в Orbo:
    </p>
    
    <div style="text-align: center; margin: 40px 0;">
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);">
        Войти в Orbo
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">
      Или скопируйте и вставьте эту ссылку в браузер:
    </p>
    <p style="font-size: 12px; color: #9ca3af; background: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; margin-bottom: 20px;">
      ${magicLink}
    </p>
    
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 10px;">
        ⏰ Ссылка действительна <strong>15 минут</strong>.
      </p>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">
        Если вы не запрашивали вход в Orbo, просто проигнорируйте это письмо.
      </p>
    </div>
  </div>
  
  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">© 2025 Orbo. Все права защищены.</p>
    <p style="margin: 5px 0;">Платформа для управления сообществами</p>
  </div>
</body>
</html>
  `.trim()
}

