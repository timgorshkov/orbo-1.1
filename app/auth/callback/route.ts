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
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
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

    // Получаем организации пользователя
    const { data: orgs, error: orgsError } = await supabase
      .from('memberships')
      .select('org_id, organizations(id)')
      .eq('user_id', data.user.id)

    if (orgsError) {
      console.error('[Auth Callback] Error fetching organizations:', orgsError)
      return NextResponse.redirect(`${requestUrl.origin}/orgs`)
    }

    console.log('[Auth Callback] Found', orgs?.length || 0, 'organizations')

    // Редиректим в зависимости от наличия организаций
    // ✅ Если организаций нет - редирект на welcome страницу (не на форму создания)
    if (!orgs || orgs.length === 0) {
      return NextResponse.redirect(`${requestUrl.origin}/welcome`)
    } else {
      return NextResponse.redirect(`${requestUrl.origin}/orgs`)
    }
  }

  // Если нет кода - редиректим на signin
  console.warn('[Auth Callback] No code provided, redirecting to signin')
  return NextResponse.redirect(`${requestUrl.origin}/signin`)
}

