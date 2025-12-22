import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAPILogger } from '@/lib/logger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Верификация magic link и создание сессии
 * 
 * GET /api/auth/email/verify?token=xxx
 * 
 * 1. Проверяет токен в БД
 * 2. Находит или создаёт пользователя в Supabase
 * 3. Создаёт сессию и устанавливает cookies
 * 4. Редиректит на redirectUrl
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'auth/email/verify' })
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  
  // Определяем базовый URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  if (!token) {
    logger.warn({}, 'Missing token')
    return NextResponse.redirect(new URL('/signin?error=missing_token', baseUrl))
  }
  
  try {
    // 1. Проверяем токен в БД
    const { data: authToken, error: tokenError } = await supabaseAdmin
      .from('email_auth_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_used', false)
      .single()
    
    if (tokenError || !authToken) {
      logger.warn({ token_prefix: token.substring(0, 8) }, 'Invalid or used token')
      return NextResponse.redirect(new URL('/signin?error=invalid_token', baseUrl))
    }
    
    // 2. Проверяем срок действия
    const expiresAt = new Date(authToken.expires_at)
    if (expiresAt < new Date()) {
      logger.warn({ 
        token_id: authToken.id,
        expires_at: expiresAt.toISOString()
      }, 'Token expired')
      return NextResponse.redirect(new URL('/signin?error=expired_token', baseUrl))
    }
    
    const email = authToken.email
    logger.info({ email, token_id: authToken.id }, 'Valid token, processing auth')
    
    // 3. Находим или создаём пользователя в Supabase
    let userId: string | null = null
    
    // Пробуем найти существующего пользователя
    const { data: existingUser } = await supabaseAdmin.rpc('get_user_id_by_email', { 
      p_email: email 
    })
    
    if (existingUser) {
      userId = existingUser
      logger.info({ email, user_id: userId }, 'Found existing user')
      
      // Обновляем email_confirmed_at для существующих пользователей (клик по magic link подтверждает email)
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser, {
        email_confirm: true
      })
      
      if (updateError) {
        logger.warn({ error: updateError.message, user_id: existingUser }, 'Failed to update email_confirmed_at')
      } else {
        logger.debug({ user_id: existingUser }, 'Updated email confirmation for magic link user')
      }
    } else {
      // Создаём нового пользователя
      const tempPassword = `temp_${Math.random().toString(36).slice(2)}_${Date.now()}`
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          auth_provider: 'email_magic_link'
        }
      })
      
      if (createError || !newUser.user) {
        logger.error({ error: createError?.message, email }, 'Failed to create user')
        return NextResponse.redirect(new URL('/signin?error=user_create_failed', baseUrl))
      }
      
      userId = newUser.user.id
      logger.info({ email, user_id: userId }, 'Created new user')
      
      // Sync to CRM (non-blocking)
      import('@/lib/services/weeekService').then(({ onUserRegistration }) => {
        onUserRegistration(userId!, email).catch(() => {});
      }).catch(() => {});
    }
    
    // 4. Проверяем что userId определён
    if (!userId) {
      logger.error({ email }, 'User ID is null after lookup/create')
      return NextResponse.redirect(new URL('/signin?error=user_error', baseUrl))
    }
    
    // 5. Создаём сессию через временный пароль
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (!userData?.user) {
      logger.error({ user_id: userId }, 'Failed to fetch user')
      return NextResponse.redirect(new URL('/signin?error=user_error', baseUrl))
    }
    
    // 6. Устанавливаем временный пароль и логинимся
    const tempPassword = `temp_email_${Math.random().toString(36).slice(2)}_${Date.now()}`
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPassword })
    
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email: userData.user.email!,
      password: tempPassword
    })
    
    if (sessionError || !sessionData?.session) {
      logger.error({ 
        error: sessionError?.message,
        user_id: userId
      }, 'Failed to create session')
      return NextResponse.redirect(new URL('/signin?error=session_error', baseUrl))
    }
    
    // 7. Помечаем токен как использованный
    await supabaseAdmin
      .from('email_auth_tokens')
      .update({ 
        is_used: true, 
        used_at: new Date().toISOString(),
        user_id: userId
      })
      .eq('id', authToken.id)
    
    // 8. Устанавливаем session cookies через @supabase/ssr
    const cookieStore = await cookies()
    
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
              // Ignore errors (may happen after response is sent)
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options })
            } catch (error) {
              // Ignore errors
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
      }, 'Error setting session cookies')
      // Continue anyway
    }
    
    // 9. Редиректим на целевой URL
    const finalRedirectUrl = authToken.redirect_url || '/orgs'
    
    logger.info({ 
      user_id: userId,
      email,
      redirect_url: finalRedirectUrl
    }, 'Email auth successful')
    
    // Возвращаем HTML с meta refresh для надёжной установки cookies
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${finalRedirectUrl}">
  <title>Вход в Orbo...</title>
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
    .sub-message {
      font-size: 14px;
      opacity: 0.8;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <div class="message">Добро пожаловать в Orbo!</div>
    <div class="sub-message">Переход в личный кабинет...</div>
  </div>
  <script>
    setTimeout(() => {
      window.location.href = '${finalRedirectUrl}';
    }, 100);
  </script>
</body>
</html>
    `.trim()
    
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
    
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Email verification failed')
    
    return NextResponse.redirect(new URL('/signin?error=verification_failed', baseUrl))
  }
}

