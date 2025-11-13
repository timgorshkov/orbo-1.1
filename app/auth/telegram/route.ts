/**
 * Telegram Authorization Handler
 * Обрабатывает авторизацию через короткий код из Telegram бота
 * 
 * GET /auth/telegram?code=XXXXXX&redirect=/path/to/redirect
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    
    // ✅ ВСЕГДА используем server-side метод для надежности
    // Client-side метод не работает надёжно ни в Telegram WebView, ни в обычных браузерах
    console.log('[Telegram Auth] 🔄 Using server-side cookies method')
    console.log('[Telegram Auth] ==================== REDIRECTING TO FALLBACK ====================')
    
    // Редиректим на fallback endpoint который установит cookies на сервере
    const fallbackUrl = new URL('/auth/telegram-fallback', request.url)
    fallbackUrl.searchParams.set('code', code)
    fallbackUrl.searchParams.set('redirect', finalRedirectUrl)
    
    return NextResponse.redirect(fallbackUrl)
    
  } catch (error) {
    console.error('[Telegram Auth] ❌ Error:', error)
    console.error('[Telegram Auth] ==================== ERROR ====================')
    return NextResponse.redirect(new URL('/signin?error=internal_error', request.url))
  }
}
