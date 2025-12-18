/**
 * Telegram Authorization Handler
 * Обрабатывает авторизацию через короткий код из Telegram бота
 * 
 * GET /auth/telegram-handler?code=XXXXXX&redirect=/path/to/redirect
 * 
 * Note: This route is called from /auth/telegram page after OG metadata is rendered
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAPILogger } from '@/lib/logger'

// Admin client для создания сессии
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/auth/telegram-handler' });
  logger.info({}, 'Telegram auth handler started');
  
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const redirectUrl = searchParams.get('redirect') || '/orgs'
  
  logger.debug({ 
    has_code: !!code,
    redirect_url: redirectUrl
  }, 'Telegram auth parameters');
  
  if (!code) {
    logger.error({}, 'Missing code parameter');
    return NextResponse.redirect(new URL('/signin?error=missing_code', request.url))
  }
  
  try {
    // 1. Проверяем код в нашей таблице
    const { data: authCodes, error: codeError } = await supabaseAdmin
      .from('telegram_auth_codes')
      .select('*')
      .eq('code', code)
      .not('telegram_user_id', 'is', null)  // Проверяем что telegram_user_id уже заполнен
      .maybeSingle()
    
    if (codeError) {
      logger.error({ 
        error: codeError.message,
        error_code: codeError.code
      }, 'Error querying code');
      return NextResponse.redirect(new URL('/signin?error=query_error', request.url))
    }
    
    if (!authCodes) {
      logger.error({ code }, 'Code not found or not verified');
      return NextResponse.redirect(new URL('/signin?error=invalid_code', request.url))
    }
    
    // Проверяем, не использован ли код уже (с grace period для Telegram preview)
    if (authCodes.is_used) {
      const usedAt = authCodes.used_at ? new Date(authCodes.used_at) : null
      const now = new Date()
      
      // Разрешаем повторное использование в течение 30 секунд (для предпросмотра Telegram)
      if (usedAt && (now.getTime() - usedAt.getTime()) > 30000) {
        logger.error({ 
          code_id: authCodes.id,
          used_at: usedAt.toISOString()
        }, 'Code already used and expired');
        return NextResponse.redirect(new URL('/signin?error=code_already_used', request.url))
      }
      
      logger.warn({ 
        code_id: authCodes.id,
        used_at: usedAt?.toISOString()
      }, 'Code already used, redirecting to fallback immediately');
      
      // Для уже использованного кода сразу редиректим на fallback
      // Не пытаемся создать новую сессию (пароль уже изменился)
      let finalRedirectUrl = authCodes.redirect_url || redirectUrl
      if (finalRedirectUrl.includes('/p/') && finalRedirectUrl.includes('/events/')) {
        finalRedirectUrl = finalRedirectUrl.replace('/p/', '/app/')
      }
      
      const fallbackUrl = new URL('/auth/telegram-fallback', request.url)
      fallbackUrl.searchParams.set('code', code)
      fallbackUrl.searchParams.set('redirect', finalRedirectUrl)
      
      return NextResponse.redirect(fallbackUrl)
    }
    
    logger.debug({ 
      code_id: authCodes.id,
      telegram_user_id: authCodes.telegram_user_id,
      org_id: authCodes.org_id
    }, 'Code found');
    
    // 2. Проверяем срок действия
    const expiresAt = new Date(authCodes.expires_at)
    const currentTime = new Date()
    
    if (expiresAt < currentTime) {
      logger.error({ 
        code_id: authCodes.id,
        expires_at: expiresAt.toISOString()
      }, 'Code expired');
      return NextResponse.redirect(new URL('/signin?error=expired_code', request.url))
    }
    
    logger.debug({ code_id: authCodes.id }, 'Code is valid');
    
    // 3. Ищем пользователя по telegram_user_id и org_id
    const { data: telegramAccounts, error: accountError } = await supabaseAdmin
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', authCodes.telegram_user_id)
      .eq('org_id', authCodes.org_id)
      .maybeSingle()
    
    if (accountError || !telegramAccounts) {
      logger.error({ 
        error: accountError?.message,
        telegram_user_id: authCodes.telegram_user_id,
        org_id: authCodes.org_id
      }, 'User not found');
      return NextResponse.redirect(new URL('/signin?error=user_not_found', request.url))
    }
    
    const userId = telegramAccounts.user_id
    logger.debug({ 
      user_id: userId,
      telegram_user_id: authCodes.telegram_user_id
    }, 'User found');
    
    // 4. Получаем email пользователя
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (userError || !userData?.user) {
      logger.error({ 
        error: userError?.message,
        user_id: userId
      }, 'Error fetching user');
      return NextResponse.redirect(new URL('/signin?error=user_error', request.url))
    }
    
    const userEmail = userData.user.email
    logger.debug({ user_id: userId, email: userEmail }, 'User email retrieved');
    
    // 5. Устанавливаем временный пароль для этого пользователя
    const tempPassword = `temp_${Math.random().toString(36).slice(2)}_${Date.now()}`
    
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword
    })
    
    if (updateError) {
      logger.error({ 
        error: updateError.message,
        user_id: userId
      }, 'Error setting temp password');
      return NextResponse.redirect(new URL('/signin?error=password_error', request.url))
    }
    
    logger.debug({ user_id: userId }, 'Temp password set');
    
    // 6. Входим с email и паролем чтобы получить валидную сессию
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email: userEmail!,
      password: tempPassword
    })
    
    if (sessionError || !sessionData?.session) {
      logger.error({ 
        error: sessionError?.message,
        user_id: userId
      }, 'Error signing in');
      return NextResponse.redirect(new URL('/signin?error=signin_error', request.url))
    }
    
    logger.info({ 
      user_id: sessionData.user.id,
      code_id: authCodes.id
    }, 'Session created for user');
    
    // 7. Помечаем код как использованный
    await supabaseAdmin
      .from('telegram_auth_codes')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('id', authCodes.id)
    
    logger.debug({ code_id: authCodes.id }, 'Code marked as used');
    
    // 8. Определяем куда редиректить
    let finalRedirectUrl = authCodes.redirect_url || redirectUrl
    
    // ВАЖНО: Если это публичная страница события и пользователь авторизован,
    // редиректим сразу на защищённую страницу для корректной работы в Telegram WebView
    if (finalRedirectUrl.includes('/p/') && finalRedirectUrl.includes('/events/')) {
      // Заменяем /p/ на /app/ для авторизованных пользователей
      finalRedirectUrl = finalRedirectUrl.replace('/p/', '/app/')
      logger.debug({ redirect_url: finalRedirectUrl }, 'Redirecting to protected page for authenticated user');
    }
    
    logger.info({ 
      redirect_url: finalRedirectUrl,
      user_id: sessionData.user.id
    }, 'Preparing session setup page');
    
    // ✅ ВСЕГДА используем server-side метод для надежности
    // Client-side метод не работает надёжно ни в Telegram WebView, ни в обычных браузерах
    logger.debug({}, 'Using server-side cookies method');
    
    // Редиректим на fallback endpoint который установит cookies на сервере
    const fallbackUrl = new URL('/auth/telegram-fallback', request.url)
    fallbackUrl.searchParams.set('code', code)
    fallbackUrl.searchParams.set('redirect', finalRedirectUrl)
    
    return NextResponse.redirect(fallbackUrl)
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Telegram auth handler error');
    return NextResponse.redirect(new URL('/signin?error=internal_error', request.url))
  }
}
