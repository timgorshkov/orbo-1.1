import { NextRequest, NextResponse } from 'next/server'

/**
 * Auto-login endpoint: sets a JWT session cookie and redirects.
 * Used by MiniApp registration to provide seamless login after account creation.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const redirect = searchParams.get('redirect') || '/orgs'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

  if (!token) {
    return NextResponse.redirect(new URL('/signin', baseUrl))
  }

  const cookieName = process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'

  const response = NextResponse.redirect(new URL(redirect, baseUrl))

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return response
}
