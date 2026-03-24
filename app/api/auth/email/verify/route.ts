import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { encode } from 'next-auth/jwt'
import { scheduleOnboardingChain } from '@/lib/services/onboardingChainService'

const supabaseAdmin = createAdminServer()

/**
 * Верификация magic link и создание сессии
 * 
 * GET /api/auth/email/verify?token=xxx
 * 
 * 1. Проверяет токен в БД
 * 2. Находит или создаёт пользователя
 * 3. Создаёт JWT сессию напрямую (без Credentials callback)
 * 4. Редиректит на redirectUrl
 */
// Паттерн для определения ботов/сканеров ссылок (Telegram, Slack, Facebook и др.)
// Они делают prefetch magic link и сжигают токен до того, как пользователь кликает
const BOT_UA_PATTERN = /TelegramBot|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|Applebot|Googlebot|bingbot|YandexBot|SemrushBot|AhrefsBot|DotBot|linkpreview|preview|crawler|spider/i

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'auth/email/verify' })
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  // Определяем базовый URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

  // Блокируем ботов и сканеры ссылок — они не должны обрабатывать токены
  // TelegramBot и подобные делают prefetch magic link, сжигая одноразовый токен
  const userAgent = request.headers.get('user-agent') || ''
  if (BOT_UA_PATTERN.test(userAgent)) {
    logger.info({ userAgent }, 'Bot/scanner prefetch detected, returning empty response')
    return new NextResponse(null, { status: 200 })
  }

  if (!token) {
    logger.warn({}, 'Missing token')
    return NextResponse.redirect(new URL('/signin?error=missing_token', baseUrl))
  }
  
  try {
    // 1. Проверяем токен в БД (без фильтра is_used — чтобы различить "не найден" vs "уже использован")
    const { data: tokenRow, error: tokenLookupError } = await supabaseAdmin
      .from('email_auth_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (tokenLookupError || !tokenRow) {
      logger.warn({ token_prefix: token.substring(0, 8) }, 'Token not found')
      return NextResponse.redirect(new URL('/signin?error=invalid_token', baseUrl))
    }

    if (tokenRow.is_used) {
      logger.warn({
        token_prefix: token.substring(0, 8),
        email: tokenRow.email,
        used_at: tokenRow.used_at,
        token_id: tokenRow.id
      }, 'Token already used — possible bot prefetch or double-click')
      return NextResponse.redirect(new URL('/signin?error=invalid_token', baseUrl))
    }

    const authToken = tokenRow

    // 2. Проверяем срок действия
    const expiresAt = new Date(authToken.expires_at)
    if (expiresAt < new Date()) {
      logger.warn({
        token_id: authToken.id,
        email: authToken.email,
        expires_at: expiresAt.toISOString()
      }, 'Token expired')
      return NextResponse.redirect(new URL('/signin?error=expired_token', baseUrl))
    }
    
    const email = authToken.email.toLowerCase()
    logger.info({ email, token_id: authToken.id }, 'Valid token, processing auth')
    
    // 3. Помечаем токен как использованный
    await supabaseAdmin
      .from('email_auth_tokens')
      .update({ 
        is_used: true, 
        used_at: new Date().toISOString()
      })
      .eq('id', authToken.id)
    
    // 4. Находим или создаём пользователя в локальной БД
    let { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single()
    
    let isNewUser = false
    
    if (!user) {
      // Создаём нового пользователя
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          email: email,
          email_verified: new Date().toISOString(),
        })
        .select()
        .single()
      
      if (createError) {
        logger.error({ error: createError.message, email }, 'Failed to create user')
        return NextResponse.redirect(new URL('/signin?error=user_create_failed', baseUrl))
      }
      
      user = newUser
      isNewUser = true
      logger.info({ email, user_id: user.id }, 'Created new user via email')
      
      scheduleOnboardingChain(user.id, 'email').catch((err: unknown) => {
        logger.error({ error: err instanceof Error ? err.message : String(err), user_id: user.id }, 'Failed to schedule onboarding chain')
      })
    } else {
      // Обновляем email_verified
      await supabaseAdmin
        .from('users')
        .update({ 
          email_verified: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        
      logger.info({ email, user_id: user.id }, 'User signed in via email')
    }
    
    // 5. Создаём сессию через account record (для email provider)
    // Проверяем/создаём account для email
    const { data: existingAccount } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'email')
      .single()
    
    if (!existingAccount) {
      const { error: accountError } = await supabaseAdmin
        .from('accounts')
        .insert({
          user_id: user.id,
          type: 'email',
          provider: 'email',
          provider_account_id: email,
        })
      if (accountError) {
        logger.error({ error: accountError.message, user_id: user.id, email }, 'Failed to create email account record')
      }
    }
    
    // 6. Создаём JWT токен напрямую
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
    if (!secret) {
      logger.error({}, 'AUTH_SECRET not configured')
      return NextResponse.redirect(new URL('/signin?error=config_error', baseUrl))
    }
    
    // Определяем имя cookie для salt
    const cookieName = process.env.NODE_ENV === 'production' 
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token'
    
    const jwtToken = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.image,
        provider: 'email',
        sub: user.id, // NextAuth requires sub
      },
      secret,
      salt: cookieName,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })
    
    // 7. Определяем redirect URL
    // Для новых пользователей добавляем ?new=1 для корректного отслеживания регистрации
    let finalRedirectUrl = authToken.redirect_url || '/orgs'
    if (isNewUser) {
      const separator = finalRedirectUrl.includes('?') ? '&' : '?'
      finalRedirectUrl = `${finalRedirectUrl}${separator}new=1`
    }
    
    logger.info({ 
      user_id: user.id,
      email,
      redirect_url: finalRedirectUrl,
      is_new_user: isNewUser
    }, 'Email auth successful, creating session')
    
    // 8. Создаём response с редиректом и устанавливаем cookie
    const response = NextResponse.redirect(new URL(finalRedirectUrl, baseUrl))
    
    // Устанавливаем session cookie (cookieName уже определён выше)
    response.cookies.set(cookieName, jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })
    
    return response
    
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Email verification failed')
    
    return NextResponse.redirect(new URL('/signin?error=verification_failed', baseUrl))
  }
}
