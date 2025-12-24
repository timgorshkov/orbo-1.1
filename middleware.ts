import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceLogger } from '@/lib/logger'
// НЕ импортируем auth() - вызов вызывает UntrustedHost ошибку в Docker
// Проверяем NextAuth сессию через наличие session cookie

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

/**
 * Check if request is for the public website (orbo.ru)
 * vs the application (my.orbo.ru)
 */
function isWebsiteDomain(request: NextRequest): boolean {
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || ''
  
  // Extract hostname without port
  const hostname = host.split(':')[0]
  
  // Website domains: exactly orbo.ru or www.orbo.ru
  // App domains: my.orbo.ru, app.orbo.ru, etc.
  // IMPORTANT: Use exact match to avoid my.orbo.ru matching orbo.ru
  const websiteDomains = ['orbo.ru', 'www.orbo.ru']
  const isWebsite = websiteDomains.includes(hostname)
  
  // Also check for explicit website port in development
  if (host.includes('localhost:3001')) {
    return true
  }
  
  return isWebsite
}

/**
 * Website routes that should be rewritten to /site folder
 * Public URL (orbo.ru/product) -> Internal path (/site/product)
 */
const WEBSITE_ROUTES = ['/', '/product', '/events', '/notifications', '/crm', '/journal', '/terms', '/privacy', '/whatsapp-migration']

function isWebsiteRoute(pathname: string): boolean {
  return WEBSITE_ROUTES.some(route => 
    pathname === route || (route !== '/' && pathname.startsWith(route + '/'))
  )
}

/**
 * Map public website route to internal /site route
 */
function getWebsiteInternalPath(pathname: string): string {
  if (pathname === '/') {
    return '/site'
  }
  return `/site${pathname}`
}

export async function middleware(request: NextRequest) {
  const logger = createServiceLogger('middleware');
  const { pathname } = request.nextUrl
  
  // ========================================
  // WEBSITE DOMAIN HANDLING (orbo.ru)
  // Rewrites public routes to /site folder
  // ========================================
  if (isWebsiteDomain(request)) {
    // Rewrite website routes to /site folder
    // Public URL stays clean (orbo.ru/product), internal path is /site/product
    if (isWebsiteRoute(pathname)) {
      const internalPath = getWebsiteInternalPath(pathname)
      const url = request.nextUrl.clone()
      url.pathname = internalPath
      return NextResponse.rewrite(url)
    }
    
    // For app routes on website domain, redirect to my.orbo.ru
    if (pathname.startsWith('/app') || pathname.startsWith('/orgs') || pathname.startsWith('/signin') || pathname.startsWith('/signup')) {
      const appUrl = new URL(pathname, 'https://my.orbo.ru')
      appUrl.search = request.nextUrl.search
      return NextResponse.redirect(appUrl)
    }
    
    // Static files and API routes pass through
    return NextResponse.next()
  }
  
  // ========================================
  // APPLICATION DOMAIN HANDLING (my.orbo.ru)
  // ========================================
  
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

  // Исключаем публичные пути и API маршруты из проверки аутентификации
  // Note: pathname already extracted above for website domain check
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
    pathname === '/' || // Root redirects to /signin or /orgs
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

  // Проверяем NextAuth сессию через наличие session cookie
  // НЕ вызываем auth() - это вызывает UntrustedHost ошибку
  const authCookieNames = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
  ]
  const hasNextAuthSession = authCookieNames.some(name => request.cookies.has(name))

  // Пользователь авторизован если есть хотя бы одна активная сессия
  const isAuthenticated = !!supabaseSession || hasNextAuthSession

  // Если пользователь не авторизован и пытается получить доступ к защищенному маршруту
  if (!isAuthenticated && (pathname.startsWith('/app') || pathname.startsWith('/superadmin') || pathname.startsWith('/orgs') || pathname.startsWith('/welcome'))) {
    // Логируем только редиректы (не каждый запрос)
    logger.debug({ 
      pathname, 
      hasSupabase: !!supabaseSession, 
      hasNextAuth: hasNextAuthSession 
    }, 'Unauthenticated access, redirecting to signin')
    
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
