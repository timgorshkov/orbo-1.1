import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  console.log('[Auth Callback] Processing callback:', {
    hasCode: !!code,
    origin: requestUrl.origin
  })

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
            return request.cookies.get(name)?.value
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
      console.error('[Auth Callback] Exchange error:', error)
      return NextResponse.redirect(`${requestUrl.origin}/signin?error=auth_failed`)
    }

    console.log('[Auth Callback] Session created for user:', data.user?.email)

    // Определяем URL редиректа
    const redirectUrl = new URL(requestUrl.origin)
    
    // Получаем организации пользователя
    const { data: orgs, error: orgsError } = await supabase
      .from('memberships')
      .select('org_id, organizations(id)')
      .eq('user_id', data.user.id)

    if (orgsError) {
      console.error('[Auth Callback] Error fetching organizations:', orgsError)
      redirectUrl.pathname = '/orgs'
    } else {
      console.log('[Auth Callback] Found', orgs?.length || 0, 'organizations')

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
  console.warn('[Auth Callback] No code provided, redirecting to signin')
  return NextResponse.redirect(`${requestUrl.origin}/signin`)
}

