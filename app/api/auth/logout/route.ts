import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

// POST /api/auth/logout - Clear Supabase auth session
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/auth/logout' });
  try {
    // Проверяем наличие тела запроса
    let returnUrl = '/'
    try {
      const body = await request.json()
      returnUrl = body.returnUrl || '/'
    } catch (e) {
      // Тело запроса пустое или невалидный JSON - это нормально
      logger.debug({}, 'No request body or invalid JSON, using default returnUrl');
    }
    
    logger.info({ return_url: returnUrl }, 'Starting logout process');
    
    // Sign out from Supabase (clears session)
    const supabase = await createClientServer()
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      logger.warn({ 
        error: error.message
      }, 'Supabase signOut error, continuing with manual cookie clearing');
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
    
    logger.debug({ 
      cookie_count: supabaseCookies.length,
      cookie_names: supabaseCookies.map(c => c.name)
    }, 'Found Supabase cookies to clear');
    
    // Delete cookies by setting them to expire immediately
    for (const cookie of supabaseCookies) {
      cookieStore.set(cookie.name, '', {
        maxAge: 0,
        expires: new Date(0),
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      })
    }
    
    logger.info({ 
      cookies_cleared: supabaseCookies.length
    }, 'Logout completed successfully');
    
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
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error during logout');
    return NextResponse.json(
      { 
        error: 'Failed to logout',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

