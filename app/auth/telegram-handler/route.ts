/**
 * Telegram Authorization Handler
 * Обрабатывает авторизацию через короткий код из Telegram бота
 * 
 * GET /auth/telegram-handler?code=XXXXXX&redirect=/path/to/redirect
 * 
 * Создаёт NextAuth JWT сессию напрямую (без Supabase Auth)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { encode } from 'next-auth/jwt'

/**
 * Get the public base URL for redirects
 */
function getPublicBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }
  
  return new URL(request.url).origin
}

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/auth/telegram-handler' });
  logger.info({}, 'Telegram auth handler started');
  
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const redirectUrl = searchParams.get('redirect') || '/orgs'
  
  const baseUrl = getPublicBaseUrl(request)
  
  logger.debug({ 
    has_code: !!code,
    redirect_url: redirectUrl,
    base_url: baseUrl
  }, 'Telegram auth parameters');
  
  if (!code) {
    logger.error({}, 'Missing code parameter');
    return NextResponse.redirect(new URL('/signin?error=missing_code', baseUrl))
  }
  
  try {
    const dbClient = createAdminServer()
    
    // 1. Проверяем код в локальной БД
    const { data: authCodes, error: codeError } = await dbClient
      .from('telegram_auth_codes')
      .select('*')
      .eq('code', code)
      .not('telegram_user_id', 'is', null)
      .maybeSingle()
    
    if (codeError) {
      logger.error({ 
        error: codeError.message,
        error_code: codeError.code
      }, 'Error querying code');
      return NextResponse.redirect(new URL('/signin?error=query_error', baseUrl))
    }
    
    if (!authCodes) {
      logger.warn({ code: code.substring(0, 3) + '***' }, '[Telegram Auth] Code not found or not verified by bot');
      return NextResponse.redirect(new URL('/signin?error=invalid_code', baseUrl))
    }
    
    // Проверяем, не использован ли код уже (с grace period для Telegram preview)
    if (authCodes.is_used) {
      const usedAt = authCodes.used_at ? new Date(authCodes.used_at) : null
      const now = new Date()
      
      if (usedAt && (now.getTime() - usedAt.getTime()) > 30000) {
        logger.warn({ 
          code_id: authCodes.id,
          used_at: usedAt.toISOString()
        }, '[Telegram Auth] Code expired (used >30s ago)');
        return NextResponse.redirect(new URL('/signin?error=code_already_used', baseUrl))
      }
      
      logger.info({ 
        code_id: authCodes.id,
        used_at: usedAt?.toISOString()
      }, '[Telegram Auth] Code reused within grace period');
    }
    
    logger.debug({ 
      code_id: authCodes.id,
      telegram_user_id: authCodes.telegram_user_id,
      org_id: authCodes.org_id
    }, 'Code found');
    
    // 2. Проверяем срок действия
    const expiresAt = new Date(authCodes.expires_at)
    if (expiresAt < new Date()) {
      logger.warn({ 
        code_id: authCodes.id,
        expires_at: expiresAt.toISOString()
      }, '[Telegram Auth] Code TTL expired');
      return NextResponse.redirect(new URL('/signin?error=expired_code', baseUrl))
    }
    
    // 3. Ищем пользователя по telegram_user_id и org_id в локальной БД
    const { data: telegramAccount, error: accountError } = await dbClient
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', authCodes.telegram_user_id)
      .eq('org_id', authCodes.org_id)
      .maybeSingle()
    
    if (accountError || !telegramAccount) {
      logger.error({ 
        error: accountError?.message,
        telegram_user_id: authCodes.telegram_user_id,
        org_id: authCodes.org_id
      }, 'Telegram account not found');
      return NextResponse.redirect(new URL('/signin?error=user_not_found', baseUrl))
    }
    
    const userId = telegramAccount.user_id
    logger.debug({ user_id: userId }, 'User found via telegram account');
    
    // 4. Получаем данные пользователя из локальной таблицы users
    const { data: user, error: userError } = await dbClient
      .from('users')
      .select('id, email, name, image')
      .eq('id', userId)
      .single()
    
    if (userError || !user) {
      logger.error({ 
        error: userError?.message,
        user_id: userId
      }, 'User not found in users table');
      return NextResponse.redirect(new URL('/signin?error=user_error', baseUrl))
    }
    
    // Если email пустой, используем фейковый email для Telegram пользователей
    const userEmail = user.email || `tg${authCodes.telegram_user_id}@telegram.user`
    
    logger.debug({ user_id: user.id, email: userEmail, has_real_email: !!user.email }, 'User data retrieved');
    
    // 5. Помечаем код как использованный
    await dbClient
      .from('telegram_auth_codes')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('id', authCodes.id)
    
    logger.debug({ code_id: authCodes.id }, 'Code marked as used');
    
    // 6. Создаём NextAuth JWT токен
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
    if (!secret) {
      logger.error({}, 'AUTH_SECRET not configured')
      return NextResponse.redirect(new URL('/signin?error=config_error', baseUrl))
    }
    
    const cookieName = process.env.NODE_ENV === 'production' 
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token'
    
    const jwtToken = await encode({
      token: {
        id: user.id,
        sub: user.id,
        email: userEmail,
        name: user.name,
        picture: user.image,
        provider: 'telegram',
      },
      secret,
      salt: cookieName,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })
    
    logger.info({ 
      user_id: user.id,
      code_id: authCodes.id
    }, 'Session created for user');
    
    // 7. Определяем куда редиректить
    // ВАЖНО: НЕ заменяем /p/ на /app/ - участники должны идти на публичную страницу
    // Публичная страница /p/ сама проверит авторизацию и покажет нужный контент
    let finalRedirectUrl = authCodes.redirect_url || redirectUrl
    
    logger.info({ 
      redirect_url: finalRedirectUrl,
      user_id: user.id
    }, 'Redirecting to final URL');
    
    // 8. Создаём response с редиректом и устанавливаем cookie
    const response = NextResponse.redirect(new URL(finalRedirectUrl, baseUrl))
    
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
    }, 'Telegram auth handler error');
    return NextResponse.redirect(new URL('/signin?error=internal_error', baseUrl))
  }
}
