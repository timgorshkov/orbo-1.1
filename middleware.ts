import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceLogger } from '@/lib/logger-base'

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
const WEBSITE_ROUTES = ['/', '/product', '/events', '/notifications', '/crm', '/pricing', '/journal', '/terms', '/privacy', '/whatsapp-migration', '/agencies', '/events-organizers']

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

/**
 * Check if user has NextAuth session cookie
 */
function hasAuthSession(request: NextRequest): boolean {
  const authCookieNames = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
  ]
  return authCookieNames.some(name => request.cookies.has(name))
}

const SCANNER_PATTERN = /\.(env|git|php|asp|aspx|bak|sql|log|old|orig|swp|yml)$|wp-login|wp-admin|xmlrpc|phpinfo|phpmyadmin|\/\.well-known\/security|composer\.(json|lock)|package\.json$/i;

/**
 * Checks whether a Next-Action header value looks like a real action ID.
 * Real Next.js Server Action IDs are 40-char hex strings.
 * Short/arbitrary values like "dontcare", "r", "x" are scanner probes.
 */
function isSuspiciousNextAction(actionId: string): boolean {
  // Valid action IDs are exactly 40 hex characters
  return !/^[0-9a-f]{40}$/.test(actionId)
}

export async function middleware(request: NextRequest) {
  const logger = createServiceLogger('middleware');
  const { pathname } = request.nextUrl

  // Block scanner probes but allow legitimate /api/admin/ routes
  if (SCANNER_PATTERN.test(pathname) || (pathname.match(/\/admin\//i) && !pathname.startsWith('/api/'))) {
    return new NextResponse(null, { status: 404 })
  }

  // Block bogus Next-Action header scanning (e.g. "dontcare", "r", "x")
  const nextAction = request.headers.get('next-action')
  if (nextAction && isSuspiciousNextAction(nextAction)) {
    return new NextResponse(null, { status: 400 })
  }

  // ========================================
  // WEBSITE DOMAIN HANDLING (orbo.ru)
  // Rewrites public routes to /site folder
  // ========================================
  if (isWebsiteDomain(request)) {
    // Fix broken UTM links: /utm_source=...&utm_medium=... -> /?utm_source=...&utm_medium=...
    // Ad platforms sometimes strip the "?" turning query params into path segments
    if (pathname.startsWith('/utm_') || pathname.startsWith('/utm ')) {
      const url = request.nextUrl.clone()
      // Combine path-as-params with any existing query string (e.g. ?erid=...)
      const paramsFromPath = pathname.slice(1) // remove leading "/"
      const existingSearch = url.search ? url.search.slice(1) : '' // remove leading "?"
      const combined = existingSearch ? `${paramsFromPath}&${existingSearch}` : paramsFromPath
      url.pathname = '/site'
      url.search = `?${combined}`
      return NextResponse.rewrite(url)
    }

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
  
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

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
    pathname === '/' || // Root redirects to /signin or /orgs
    pathname.match(/\.(svg|png|jpg|jpeg|webp|gif|ico|css|js)$/)
  ) {
    return response
  }

  // ⭐ Проверяем NextAuth сессию через наличие session cookie
  const isAuthenticated = hasAuthSession(request)

  // Если пользователь не авторизован и пытается получить доступ к защищенному маршруту
  if (!isAuthenticated && (pathname.startsWith('/app') || pathname.startsWith('/superadmin') || pathname.startsWith('/orgs') || pathname.startsWith('/welcome'))) {
    logger.debug({ pathname }, 'Unauthenticated access, redirecting to signin')
    
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
