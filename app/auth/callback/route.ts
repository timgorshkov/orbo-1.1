import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'

/**
 * Legacy Supabase Auth callback route
 * 
 * This route was used for Supabase Auth OAuth flow.
 * Now all OAuth flows go through NextAuth.js at /api/auth/callback/[provider]
 * 
 * This route is kept for backward compatibility - it redirects to signin.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'auth/callback' })
  
  // Определяем реальный origin
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const realOrigin = forwardedHost 
    ? `${forwardedProto}://${forwardedHost.split(':')[0]}`
    : process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  logger.info({}, 'Legacy auth callback - redirecting to signin')
  
  // Redirect to signin page
  return NextResponse.redirect(`${realOrigin}/signin`)
}
