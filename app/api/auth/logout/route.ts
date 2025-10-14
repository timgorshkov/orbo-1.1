import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClientServer } from '@/lib/server/supabaseServer'

// POST /api/auth/logout - Clear Supabase auth session
export async function POST(request: NextRequest) {
  try {
    // Проверяем наличие тела запроса
    let returnUrl = '/'
    try {
      const body = await request.json()
      returnUrl = body.returnUrl || '/'
    } catch (e) {
      // Тело запроса пустое или невалидный JSON - это нормально
      console.log('[Logout] No request body or invalid JSON, using default returnUrl')
    }
    
    console.log('[Logout] Starting logout process, returnUrl:', returnUrl)
    
    // Sign out from Supabase (clears session)
    const supabase = await createClientServer()
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('[Logout] Supabase signOut error:', error)
      // Continue anyway - we'll clear cookies manually
    }
    
    // Manually clear all Supabase cookies as backup
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    
    // Find all Supabase auth cookies
    const supabaseCookies = allCookies.filter(c => 
      c.name.includes('auth-token') || 
      c.name.startsWith('sb-') ||
      c.name.includes('supabase')
    )
    
    console.log(`[Logout] Found ${supabaseCookies.length} Supabase cookies to clear:`, supabaseCookies.map(c => c.name))
    
    // Delete cookies by setting them to expire immediately
    for (const cookie of supabaseCookies) {
      cookieStore.set(cookie.name, '', {
        maxAge: 0,
        expires: new Date(0),
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      })
      console.log(`[Logout] Cleared cookie: ${cookie.name}`)
    }
    
    console.log('[Logout] Logout completed successfully')
    
    // Return response with Set-Cookie headers to clear cookies on client
    const response = NextResponse.json({ 
      success: true,
      returnUrl: returnUrl || '/'
    })
    
    // Also set cookies in response headers
    for (const cookie of supabaseCookies) {
      response.cookies.set(cookie.name, '', {
        maxAge: 0,
        expires: new Date(0),
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      })
    }
    
    return response
  } catch (error) {
    console.error('[Logout] Error during logout:', error)
    return NextResponse.json(
      { 
        error: 'Failed to logout',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

