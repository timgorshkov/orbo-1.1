import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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
      console.warn('[Middleware] Session refresh error (non-critical):', error)
    }
    return response
  }

  // ⭐ Single session check for protected routes
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Если пользователь не авторизован и пытается получить доступ к защищенному маршруту
  if (!session && (pathname.startsWith('/app') || pathname.startsWith('/superadmin'))) {
    // Перенаправляем на страницу входа
    const redirectUrl = new URL('/signin', request.url)
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
