import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAPILogger } from '@/lib/logger'

// POST /api/auth/logout - Clear auth session
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/auth/logout' })
  
  try {
    // Проверяем наличие тела запроса
    let returnUrl = '/'
    try {
      const body = await request.json()
      returnUrl = body.returnUrl || '/'
    } catch {
      // Тело запроса пустое или невалидный JSON - это нормально
      logger.debug({}, 'No request body or invalid JSON, using default returnUrl')
    }
    
    logger.info({ return_url: returnUrl }, 'Starting logout process')
    
    // Manually clear all auth cookies
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    
    // Find all auth cookies
    const authCookies = allCookies.filter(c => 
      c.name.includes('auth-token') || 
      c.name.startsWith('sb-') ||
      c.name.includes('supabase') ||
      c.name.includes('authjs') ||
      c.name.includes('next-auth')
    )
    
    logger.debug({ 
      cookie_count: authCookies.length,
      cookie_names: authCookies.map(c => c.name)
    }, 'Found auth cookies to clear')
    
    // Delete cookies by setting them to expire immediately
    for (const cookie of authCookies) {
      cookieStore.set(cookie.name, '', {
        maxAge: 0,
        expires: new Date(0),
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      })
    }
    
    logger.info({ 
      cookies_cleared: authCookies.length
    }, 'Logout completed successfully')
    
    // Return response with Set-Cookie headers to clear cookies on client
    const response = NextResponse.json({ 
      success: true,
      returnUrl: returnUrl || '/'
    })
    
    // Also set cookies in response headers
    for (const cookie of authCookies) {
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
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error during logout')
    return NextResponse.json(
      { 
        error: 'Failed to logout',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
