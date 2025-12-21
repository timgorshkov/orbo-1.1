import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceLogger } from '@/lib/logger'
import { auth } from '@/auth'

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

export async function middleware(request: NextRequest) {
  const logger = createServiceLogger('middleware');
  // Create response once - don't recreate it multiple times
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Создаем supabase клиент для проверки аутентификации и обновления токена
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => {
          return request.cookies.get(name)?.value
        },
        set: (name, value, options) => {
          // Устанавливаем куки в ответе (не пересоздаем response)
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove: (name, options) => {
          // Удаляем куки в ответе (не пересоздаем response)
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Проверяем маршруты, требующие аутентификации
  const { pathname } = request.nextUrl
  
  // Исключаем публичные пути и API маршруты из проверки аутентификации
  if (
    pathname.startsWith('/api/auth') || // NextAuth routes
    pathname.startsWith('/api/') ||
    pathname.startsWith('/healthz') ||
    pathname.startsWith('/signin') || 
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth-callback') || // Старый callback (для обратной совместимости)
    pathname.startsWith('/auth/callback') || // Новый server-side callback
    pathname.startsWith('/auth/telegram') || // Telegram auth routes
    pathname.startsWith('/p/') || // Публичные страницы (проверка доступа внутри компонентов)
    pathname === '/' ||
    pathname.match(/\.(svg|png|jpg|jpeg|webp|gif|ico|css|js)$/)
  ) {
    // ⚠️ НЕ вызываем getSession() для auth callback маршрутов - это нарушает PKCE flow!
    // Code verifier cookie должен быть доступен для exchangeCodeForSession
    if (pathname.startsWith('/auth/callback') || pathname.startsWith('/auth-callback')) {
      return response
    }
    
    // ⭐ Refresh session for other public routes to update tokens before Server Components access them
    // This prevents "Cookies can only be modified" errors in Server Components
    try {
      await supabase.auth.getSession()
    } catch (error) {
      // Ignore session refresh errors in middleware - they will be handled by Route Handlers
      logger.warn({ 
        error: error instanceof Error ? error.message : String(error),
        pathname
      }, 'Session refresh error (non-critical)');
    }
    return response
  }

  // ⭐ Проверка авторизации через Supabase
  const {
    data: { session: supabaseSession },
  } = await supabase.auth.getSession()

  // Получаем все cookies для отладки
  const allCookies = request.cookies.getAll().map(c => c.name)
  
  // Проверяем NextAuth сессию - ищем любые auth-related cookies
  const authCookieNames = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
  ]
  
  // Также проверяем cookies с callback-url (они появляются после OAuth redirect)
  const hasCallbackCookie = allCookies.some(name => name.includes('callback-url'))
  const hasSessionCookie = authCookieNames.some(name => request.cookies.has(name))
  
  // Проверяем NextAuth сессию через auth() функцию
  let hasNextAuthSession = false
  let authError: string | null = null
  
  try {
    const nextAuthSession = await auth()
    hasNextAuthSession = !!nextAuthSession?.user
    
    if (hasSessionCookie && !hasNextAuthSession) {
      logger.warn({
        pathname,
        hasSessionCookie,
        hasNextAuthSession,
        cookies: allCookies,
      }, 'Session cookie exists but auth() returned no session');
    }
  } catch (error) {
    authError = error instanceof Error ? error.message : String(error)
    // Fallback: если есть session cookie, считаем что сессия есть
    hasNextAuthSession = hasSessionCookie
    logger.warn({ 
      error: authError,
      hasNextAuthSession,
      hasSessionCookie,
      hasCallbackCookie,
      cookies: allCookies,
      pathname,
    }, 'NextAuth auth() failed, using cookie fallback');
  }

  // Пользователь авторизован если есть хотя бы одна активная сессия
  const isAuthenticated = !!supabaseSession || hasNextAuthSession
  
  // Логируем состояние для защищённых маршрутов
  if (pathname.startsWith('/orgs') || pathname.startsWith('/app') || pathname.startsWith('/superadmin')) {
    logger.info({
      pathname,
      isAuthenticated,
      hasSupabaseSession: !!supabaseSession,
      hasNextAuthSession,
      hasSessionCookie,
      cookies: allCookies,
      authError,
    }, 'Protected route auth check');
  }

  // Если пользователь не авторизован и пытается получить доступ к защищенному маршруту
  if (!isAuthenticated && (pathname.startsWith('/app') || pathname.startsWith('/superadmin') || pathname.startsWith('/orgs') || pathname.startsWith('/welcome'))) {
    // Перенаправляем на страницу входа (используем публичный URL для Docker)
    const baseUrl = getPublicBaseUrl(request)
    const redirectUrl = new URL('/signin', baseUrl)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

// Указываем маршруты для обработки middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
