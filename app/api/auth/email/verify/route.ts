import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { cookies } from 'next/headers'
import { createAPILogger } from '@/lib/logger'
import { signIn } from '@/auth'

const supabaseAdmin = createAdminServer()

/**
 * Верификация magic link и создание сессии
 * 
 * GET /api/auth/email/verify?token=xxx
 * 
 * 1. Проверяет токен в БД
 * 2. Находит или создаёт пользователя
 * 3. Создаёт сессию через NextAuth
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
      .eq('email', email.toLowerCase())
      .single()
    
    if (!user) {
      // Создаём нового пользователя
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          email: email.toLowerCase(),
          email_verified: new Date().toISOString(),
        })
        .select()
        .single()
      
      if (createError) {
        logger.error({ error: createError.message, email }, 'Failed to create user')
        return NextResponse.redirect(new URL('/signin?error=user_create_failed', baseUrl))
      }
      
      user = newUser
      logger.info({ email, user_id: user.id }, 'Created new user via email')
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
    
    // 5. Создаём сессию через NextAuth signIn
    // Используем redirect напрямую через signIn
    const finalRedirectUrl = authToken.redirect_url || '/orgs'
    
    logger.info({ 
      user_id: user.id,
      email,
      redirect_url: finalRedirectUrl
    }, 'Email auth successful')
    
    // 6. Возвращаем HTML страницу с автосабмитом формы для NextAuth
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
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
    form { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <div class="message">Добро пожаловать в Orbo!</div>
    <div class="sub-message">Переход в личный кабинет...</div>
  </div>
  <form id="authForm" method="POST" action="/api/auth/callback/email-token">
    <input type="hidden" name="email" value="${email}" />
    <input type="hidden" name="token" value="${token}" />
    <input type="hidden" name="callbackUrl" value="${finalRedirectUrl}" />
    <input type="hidden" name="csrfToken" value="" />
  </form>
  <script>
    // Получаем CSRF токен и сабмитим форму
    fetch('/api/auth/csrf')
      .then(r => r.json())
      .then(data => {
        document.querySelector('input[name="csrfToken"]').value = data.csrfToken;
        document.getElementById('authForm').submit();
      })
      .catch(() => {
        // Если не удалось получить CSRF, просто редиректим
        window.location.href = '${finalRedirectUrl}';
      });
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
