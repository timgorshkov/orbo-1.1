import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Создаем supabase клиент для проверки аутентификации
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => {
          return request.cookies.get(name)?.value
        },
        set: (name, value, options) => {
          // Устанавливаем куки в клиентской части
          request.cookies.set({
            name,
            value,
            ...options,
          })
          // Обновляем заголовки ответа
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove: (name, options) => {
          // Удаляем куки в клиентской части
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          // Обновляем заголовки ответа
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
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

  // Дополнительная проверка для отладки сессии
  if (pathname.startsWith('/app')) {
    console.log('Checking session for path:', pathname);
    const { data } = await supabase.auth.getSession()
    console.log('Session found:', !!data?.session);
    
    if (!data?.session) {
      // Добавляем дебаг-инфо в заголовки
      const redirectUrl = new URL('/signin', request.url)
      redirectUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }
  
  // Исключаем публичные пути и API маршруты из проверки аутентификации
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/healthz') ||
    pathname.startsWith('/signin') || 
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth-callback') || // Старый callback (для обратной совместимости)
    pathname.startsWith('/auth/callback') || // Новый server-side callback
    pathname.startsWith('/p/') || // Публичные страницы
    pathname === '/' ||
    pathname.match(/\.(svg|png|jpg|jpeg|webp|gif|ico|css|js)$/)
  ) {
    return response
  }

  // Проверяем пользовательскую сессию
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Если пользователь не авторизован и пытается получить доступ к защищенному маршруту
  if (!session && pathname.startsWith('/app')) {
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
