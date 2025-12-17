import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'auth/callback' });
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  // Определяем реальный origin (из X-Forwarded-* или NEXT_PUBLIC_APP_URL)
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const realOrigin = forwardedHost 
    ? `${forwardedProto}://${forwardedHost.split(':')[0]}`
    : process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin

  // Логируем все auth-related cookies для диагностики
  const allCookies = request.cookies.getAll()
  const authCookies = allCookies.filter(c => c.name.includes('auth') || c.name.includes('sb-'))
  
  logger.info({ 
    has_code: !!code,
    origin: requestUrl.origin,
    auth_cookies_count: authCookies.length,
    auth_cookie_names: authCookies.map(c => c.name)
  }, 'Processing auth callback')

  if (code) {
    const cookieStore = await cookies()
    
    // ✅ Создаем временный response для установки cookies
    const tempResponse = NextResponse.next()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            // Сначала пробуем из request cookies (более надёжно для PKCE)
            const requestCookie = request.cookies.get(name)?.value
            if (requestCookie) {
              return requestCookie
            }
            // Fallback на cookieStore
            const storeCookie = cookieStore.get(name)?.value
            return storeCookie
          },
          set(name: string, value: string, options: any) {
            // ✅ Устанавливаем cookies в cookieStore (для чтения) и в tempResponse (для отправки)
            cookieStore.set({ name, value, ...options })
            tempResponse.cookies.set({
              name,
              value,
              ...options,
            })
          },
          remove(name: string, options: any) {
            // ✅ Удаляем cookies
            cookieStore.set({ name, value: '', ...options })
            tempResponse.cookies.set({
              name,
              value: '',
              ...options,
            })
          },
        },
      }
    )

    // Обмениваем код на сессию (server-side, с правильным PKCE)
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      logger.error({ 
        error: error.message,
        status: error.status,
        code: (error as any).code,
        code_verifier_cookies: authCookies.filter(c => c.name.includes('code-verifier')).map(c => c.name)
      }, 'Exchange code for session error');
      return NextResponse.redirect(`${realOrigin}/signin?error=auth_failed&reason=${encodeURIComponent(error.message)}`)
    }

    logger.info({ user_id: data.user?.id, email: data.user?.email }, 'Session created');

    // Определяем URL редиректа (используем реальный origin)
    const redirectUrl = new URL(realOrigin)
    
    // Получаем организации пользователя
    const { data: orgs, error: orgsError } = await supabase
      .from('memberships')
      .select('org_id, organizations(id)')
      .eq('user_id', data.user.id)

    if (orgsError) {
      logger.error({ 
        error: orgsError.message,
        user_id: data.user.id
      }, 'Error fetching organizations');
      redirectUrl.pathname = '/orgs'
    } else {
      logger.info({ 
        user_id: data.user.id,
        orgs_count: orgs?.length || 0
      }, 'Found organizations');

      // Редиректим в зависимости от наличия организаций
      // ✅ Если организаций нет - редирект на welcome страницу (не на форму создания)
      if (!orgs || orgs.length === 0) {
        redirectUrl.pathname = '/welcome'
      } else {
        redirectUrl.pathname = '/orgs'
      }
    }

    // ✅ Создаем response с редиректом и копируем все cookies из tempResponse
    const redirectResponse = NextResponse.redirect(redirectUrl.toString())
    
    // ✅ Копируем все cookies из tempResponse (где они были установлены Supabase)
    tempResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value, {
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite as 'lax' | 'strict' | 'none' | undefined,
        path: cookie.path || '/',
        maxAge: cookie.maxAge,
        expires: cookie.expires
      })
    })

    return redirectResponse
  }

  // Если нет кода - редиректим на signin
  logger.warn({ origin: realOrigin }, 'No code provided, redirecting to signin');
  return NextResponse.redirect(`${realOrigin}/signin`)
}

