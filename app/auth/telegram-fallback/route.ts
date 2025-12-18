/**
 * Telegram Authorization Fallback Handler (Server-side cookies)
 * Альтернативный метод установки cookies на сервере
 * 
 * GET /auth/telegram-fallback?code=XXXXXX&redirect=/path/to/redirect
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
  const logger = createAPILogger(request, { endpoint: '/auth/telegram-fallback' });
  logger.info({}, 'Telegram auth fallback started');
  
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const redirectUrl = searchParams.get('redirect') || '/orgs'
  
  logger.debug({ 
    has_code: !!code,
    redirect_url: redirectUrl
  }, 'Telegram auth fallback parameters');
  
  if (!code) {
    logger.error({}, 'Missing code parameter');
    return NextResponse.redirect(new URL('/signin?error=missing_code', request.url))
  }
  
  try {
    // 1-7: Те же шаги что и в основном route (поиск кода, создание сессии)
    const { data: authCodes, error: codeError } = await supabaseAdmin
      .from('telegram_auth_codes')
      .select('*')
      .eq('code', code)
      .not('telegram_user_id', 'is', null)
      .maybeSingle()
    
    if (codeError || !authCodes) {
      logger.error({ 
        error: codeError?.message,
        code
      }, 'Code not found');
      return NextResponse.redirect(new URL('/signin?error=invalid_code', request.url))
    }
    
    if (authCodes.is_used) {
      const usedAt = authCodes.used_at ? new Date(authCodes.used_at) : null
      const now = new Date()
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
      }, 'Code already used, will create new session');
      // Продолжаем создание новой сессии (не возвращаемся)
      // Потому что после logout старой сессии нет
    }
    
    const expiresAt = new Date(authCodes.expires_at)
    if (expiresAt < new Date()) {
      logger.error({ 
        code_id: authCodes.id,
        expires_at: expiresAt.toISOString()
      }, 'Code expired');
      return NextResponse.redirect(new URL('/signin?error=expired_code', request.url))
    }
    
    const { data: telegramAccounts } = await supabaseAdmin
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', authCodes.telegram_user_id)
      .eq('org_id', authCodes.org_id)
      .maybeSingle()
    
    if (!telegramAccounts) {
      logger.error({ 
        telegram_user_id: authCodes.telegram_user_id,
        org_id: authCodes.org_id
      }, 'User not found');
      return NextResponse.redirect(new URL('/signin?error=user_not_found', request.url))
    }
    
    const userId = telegramAccounts.user_id
    
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (!userData?.user) {
      logger.error({ user_id: userId }, 'Error fetching user');
      return NextResponse.redirect(new URL('/signin?error=user_error', request.url))
    }
    
    // Создаём НОВЫЙ временный пароль (на случай если код используется повторно)
    const tempPassword = `temp_fallback_${Math.random().toString(36).slice(2)}_${Date.now()}`
    logger.debug({ user_id: userId }, 'Setting new temp password');
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPassword })
    
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email: userData.user.email!,
      password: tempPassword
    })
    
    if (sessionError || !sessionData?.session) {
      logger.error({ 
        error: sessionError?.message,
        user_id: userId
      }, 'Error signing in');
      return NextResponse.redirect(new URL('/signin?error=signin_error', request.url))
    }
    
    await supabaseAdmin
      .from('telegram_auth_codes')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('id', authCodes.id)
    
    // 8. Устанавливаем cookies через Supabase SSR (правильный способ)
    let finalRedirectUrl = authCodes.redirect_url || redirectUrl
    if (finalRedirectUrl.includes('/p/') && finalRedirectUrl.includes('/events/')) {
      finalRedirectUrl = finalRedirectUrl.replace('/p/', '/app/')
    }
    
    console.log('[Telegram Auth Fallback] Setting session via SSR cookies')
    
    // ✅ Используем @supabase/ssr для правильной установки cookies в Next.js App Router
    const { createServerClient } = await import('@supabase/ssr')
    const { cookies: getCookies } = await import('next/headers')
    
    const cookieStore = await getCookies()
    
    const supabaseSSR = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set({ name, value, ...options })
            } catch (error) {
              // Игнорируем ошибки установки cookies (может быть вызвано после отправки ответа)
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options })
            } catch (error) {
              // Игнорируем ошибки
            }
          },
        },
      }
    )
    
    const { error: setSessionError } = await supabaseSSR.auth.setSession({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token
    })
    
    if (setSessionError) {
      logger.error({ 
        error: setSessionError.message,
        user_id: userId
      }, 'Error setting session');
      // Продолжаем даже при ошибке
    } else {
      logger.info({ 
        user_id: userId,
        redirect_url: finalRedirectUrl
      }, 'Session set via SSR cookies');
    }
    
    logger.info({ 
      redirect_url: finalRedirectUrl,
      user_id: userId
    }, 'Redirecting to final URL');
    
    // Вместо прямого редиректа возвращаем HTML с meta refresh
    // Это даёт время браузеру сохранить cookies перед редиректом
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${finalRedirectUrl}">
  <title>Авторизация...</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      color: white;
      padding: 2rem;
    }
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top: 4px solid white;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .message {
      font-size: 18px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <div class="message">Авторизация завершена...</div>
  </div>
  <script>
    // Fallback на случай если meta refresh не сработает
    setTimeout(() => {
      window.location.href = '${finalRedirectUrl}';
    }, 100);
  </script>
</body>
</html>
`
    
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    })
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Telegram auth fallback error');
    return NextResponse.redirect(new URL('/signin?error=internal_error', request.url))
  }
}

