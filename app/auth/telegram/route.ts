/**
 * Telegram Authorization Handler
 * Обрабатывает авторизацию через короткий код из Telegram бота
 * 
 * GET /auth/telegram?code=XXXXXX&redirect=/path/to/redirect
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
  console.log('[Telegram Auth] ==================== START ====================')
  
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const redirectUrl = searchParams.get('redirect') || '/orgs'
  
  console.log('[Telegram Auth] Code:', code)
  console.log('[Telegram Auth] Redirect URL:', redirectUrl)
  
  if (!code) {
    console.error('[Telegram Auth] ❌ Missing code parameter')
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
      console.error('[Telegram Auth] ❌ Error querying code:', codeError)
      return NextResponse.redirect(new URL('/signin?error=query_error', request.url))
    }
    
    if (!authCodes) {
      console.error('[Telegram Auth] ❌ Code not found or not verified')
      return NextResponse.redirect(new URL('/signin?error=invalid_code', request.url))
    }
    
    // Проверяем, не использован ли код уже (с grace period для Telegram preview)
    if (authCodes.is_used) {
      const usedAt = authCodes.used_at ? new Date(authCodes.used_at) : null
      const now = new Date()
      
      // Разрешаем повторное использование в течение 30 секунд (для предпросмотра Telegram)
      if (usedAt && (now.getTime() - usedAt.getTime()) > 30000) {
        console.error('[Telegram Auth] ❌ Code already used and expired')
        return NextResponse.redirect(new URL('/signin?error=code_already_used', request.url))
      }
      
      console.log('[Telegram Auth] ⚠️ Code already used, redirecting to fallback immediately')
      
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
    
    console.log('[Telegram Auth] ✅ Code found:', authCodes.id)
    
    // 2. Проверяем срок действия
    const expiresAt = new Date(authCodes.expires_at)
    const currentTime = new Date()
    
    if (expiresAt < currentTime) {
      console.error('[Telegram Auth] ❌ Code expired')
      return NextResponse.redirect(new URL('/signin?error=expired_code', request.url))
    }
    
    console.log('[Telegram Auth] ✅ Code is valid')
    
    // 3. Ищем пользователя по telegram_user_id и org_id
    const { data: telegramAccounts, error: accountError } = await supabaseAdmin
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', authCodes.telegram_user_id)
      .eq('org_id', authCodes.org_id)
      .maybeSingle()
    
    if (accountError || !telegramAccounts) {
      console.error('[Telegram Auth] ❌ User not found:', accountError)
      return NextResponse.redirect(new URL('/signin?error=user_not_found', request.url))
    }
    
    const userId = telegramAccounts.user_id
    console.log('[Telegram Auth] ✅ User found:', userId)
    
    // 4. Получаем email пользователя
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (userError || !userData?.user) {
      console.error('[Telegram Auth] ❌ Error fetching user:', userError)
      return NextResponse.redirect(new URL('/signin?error=user_error', request.url))
    }
    
    const userEmail = userData.user.email
    console.log('[Telegram Auth] User email:', userEmail)
    
    // 5. Устанавливаем временный пароль для этого пользователя
    const tempPassword = `temp_${Math.random().toString(36).slice(2)}_${Date.now()}`
    
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword
    })
    
    if (updateError) {
      console.error('[Telegram Auth] ❌ Error setting temp password:', updateError)
      return NextResponse.redirect(new URL('/signin?error=password_error', request.url))
    }
    
    console.log('[Telegram Auth] ✅ Temp password set')
    
    // 6. Входим с email и паролем чтобы получить валидную сессию
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email: userEmail!,
      password: tempPassword
    })
    
    if (sessionError || !sessionData?.session) {
      console.error('[Telegram Auth] ❌ Error signing in:', sessionError)
      return NextResponse.redirect(new URL('/signin?error=signin_error', request.url))
    }
    
    console.log('[Telegram Auth] ✅ Session created for user:', sessionData.user.id)
    
    // 7. Помечаем код как использованный
    await supabaseAdmin
      .from('telegram_auth_codes')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('id', authCodes.id)
    
    console.log('[Telegram Auth] ✅ Code marked as used')
    
    // 8. Определяем куда редиректить
    let finalRedirectUrl = authCodes.redirect_url || redirectUrl
    
    // ВАЖНО: Если это публичная страница события и пользователь авторизован,
    // редиректим сразу на защищённую страницу для корректной работы в Telegram WebView
    if (finalRedirectUrl.includes('/p/') && finalRedirectUrl.includes('/events/')) {
      // Заменяем /p/ на /app/ для авторизованных пользователей
      finalRedirectUrl = finalRedirectUrl.replace('/p/', '/app/')
      console.log('[Telegram Auth] 🔄 Redirecting to protected page for authenticated user')
    }
    
    console.log('[Telegram Auth] ✅ Preparing session setup page')
    console.log('[Telegram Auth] ✅ Target redirect:', finalRedirectUrl)
    
    // ВРЕМЕННОЕ РЕШЕНИЕ: Используем fallback метод сразу для Telegram WebView
    // Причина: client-side cookies не сохраняются надёжно
    const userAgent = request.headers.get('user-agent') || ''
    const isTelegramWebView = userAgent.toLowerCase().includes('telegram')
    
    if (isTelegramWebView) {
      console.log('[Telegram Auth] 🔄 Detected Telegram WebView, using server-side cookies')
      console.log('[Telegram Auth] ==================== REDIRECTING TO FALLBACK ====================')
      
      // Редиректим на fallback endpoint который установит cookies на сервере
      const fallbackUrl = new URL('/auth/telegram-fallback', request.url)
      fallbackUrl.searchParams.set('code', code)
      fallbackUrl.searchParams.set('redirect', finalRedirectUrl)
      
      return NextResponse.redirect(fallbackUrl)
    }
    
    console.log('[Telegram Auth] ==================== SUCCESS ====================')
    
    // 9. Возвращаем HTML страницу с client-side авторизацией
    // Для обычных браузеров
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      max-width: 90%;
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
      margin-bottom: 0.5rem;
    }
    .debug {
      font-size: 12px;
      opacity: 0.7;
      margin-top: 1rem;
      max-width: 300px;
      margin-left: auto;
      margin-right: auto;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <div class="message">Авторизация...</div>
    <div class="debug" id="debug"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    const log = (msg) => {
      console.log('[Client Auth]', msg);
      const debug = document.getElementById('debug');
      if (debug) debug.textContent = msg;
    };
    
    const redirectUrl = '${finalRedirectUrl}';
    const accessToken = '${sessionData.session.access_token}';
    const refreshToken = '${sessionData.session.refresh_token}';
    const code = '${code}';
    
    const showFallbackButton = () => {
      const container = document.querySelector('.container');
      if (!container) return;
      
      const button = document.createElement('button');
      button.textContent = 'Попробовать альтернативный метод';
      button.style.cssText = 'margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: white; color: #667eea; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
      
      button.onclick = () => {
        window.location.href = '/auth/telegram-fallback?code=' + code + '&redirect=' + encodeURIComponent(redirectUrl);
      };
      
      container.appendChild(button);
      
      // Также добавляем кнопку "Продолжить без авторизации"
      const skipButton = document.createElement('button');
      skipButton.textContent = 'Продолжить без авторизации';
      skipButton.style.cssText = 'margin-top: 1rem; padding: 0.5rem 1rem; background: transparent; color: white; border: 1px solid rgba(255,255,255,0.5); border-radius: 8px; font-size: 14px; cursor: pointer;';
      
      skipButton.onclick = () => {
        window.location.href = redirectUrl;
      };
      
      container.appendChild(skipButton);
    };
    
    log('Загрузка...');
    
    // Ждём загрузки Supabase SDK
    let attempts = 0;
    const checkAndAuth = async () => {
      attempts++;
      
      if (typeof window.supabase === 'undefined') {
        if (attempts > 20) {
          log('Ошибка загрузки SDK');
          document.querySelector('.message').textContent = 'Ошибка загрузки';
          setTimeout(() => window.location.href = redirectUrl, 2000);
          return;
        }
        setTimeout(checkAndAuth, 100);
        return;
      }
      
      try {
        log('SDK загружен, создание клиента...');
        const supabase = window.supabase.createClient(
          '${process.env.NEXT_PUBLIC_SUPABASE_URL}',
          '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}'
        );
        
        log('Установка сессии...');
        const { error, data } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        
        if (error) {
          console.error('[Client Auth] Error:', error);
          log('Ошибка: ' + error.message);
          document.querySelector('.message').textContent = 'Ошибка авторизации';
          
          // Показываем кнопку для fallback метода
          showFallbackButton();
          return;
        }
        
        log('Сессия установлена!');
        console.log('[Client Auth] Session set:', data);
        
        // ВАЖНО: Даём время для сохранения cookies перед проверкой
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Проверяем что сессия действительно сохранилась
        log('Проверка сохранения...');
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          log('Проверка OK!');
          console.log('[Client Auth] Session confirmed:', session.user.id);
          
          // Ещё одна задержка для надёжности сохранения cookies
          log('Сохранение cookies...');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          log('Редирект...');
          window.location.href = redirectUrl;
        } else {
          log('Сессия не сохранилась, используем fallback');
          document.querySelector('.message').textContent = 'Переключение на надёжный метод...';
          
          // Автоматически переключаемся на fallback без кнопки
          setTimeout(() => {
            window.location.href = '/auth/telegram-fallback?code=' + code + '&redirect=' + encodeURIComponent(redirectUrl);
          }, 1000);
        }
      } catch (err) {
        console.error('[Client Auth] Exception:', err);
        log('Исключение: ' + err.message);
        document.querySelector('.message').textContent = 'Ошибка';
        
        // Показываем кнопку для fallback метода
        showFallbackButton();
      }
    };
    
    // Запускаем после загрузки страницы
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkAndAuth);
    } else {
      checkAndAuth();
    }
  </script>
</body>
</html>
`
    
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error('[Telegram Auth] ❌ Error:', error)
    console.error('[Telegram Auth] ==================== ERROR ====================')
    return NextResponse.redirect(new URL('/signin?error=internal_error', request.url))
  }
}

