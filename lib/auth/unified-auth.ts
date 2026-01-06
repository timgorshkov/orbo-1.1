/**
 * Unified Auth Layer
 * 
 * Работает только с NextAuth.js и локальной PostgreSQL.
 * Supabase Auth больше не используется.
 * 
 * Использование:
 * ```typescript
 * import { getUnifiedSession, getUnifiedUser } from '@/lib/auth/unified-auth';
 * 
 * // В Server Component или Route Handler
 * const session = await getUnifiedSession();
 * if (session) {
 *   console.log('User:', session.user);
 * }
 * ```
 */

import { cookies } from 'next/headers'
import { auth as nextAuth } from '@/auth'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('UnifiedAuth')

/**
 * Unified user representation
 */
export interface UnifiedUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  provider: 'nextauth'
  raw: {
    nextauth?: any
  }
}

/**
 * Unified session representation
 */
export interface UnifiedSession {
  user: UnifiedUser
  provider: 'nextauth'
  expires?: string
  accessToken?: string
}

/**
 * Get unified session from NextAuth
 */
export async function getUnifiedSession(): Promise<UnifiedSession | null> {
  const startTime = Date.now()
  
  try {
    const cookieStore = await cookies()
    
    // Быстрая проверка наличия cookies без сетевых вызовов
    const hasNextAuthCookies = cookieStore.get('authjs.session-token') || 
                               cookieStore.get('__Secure-authjs.session-token')
    
    // Если нет auth cookie - сразу возвращаем null
    if (!hasNextAuthCookies) {
      return null
    }
    
    // Проверяем NextAuth сессию
    let nextAuthSession: any = null
    try {
      const authResult = await nextAuth()
      if (authResult && typeof authResult === 'object' && 'user' in authResult) {
        nextAuthSession = authResult
      }
    } catch (authError) {
      logger.warn({
        error: authError instanceof Error ? authError.message : String(authError),
        duration_ms: Date.now() - startTime
      }, 'NextAuth auth() failed')
      return null
    }
    
    if (!nextAuthSession?.user?.email) {
      return null
    }
    
    const totalDuration = Date.now() - startTime
    if (totalDuration > 1000) {
      logger.warn({
        email: nextAuthSession.user.email,
        total_duration_ms: totalDuration
      }, 'getUnifiedSession slow')
    }
    
    return {
      user: {
        id: nextAuthSession.user.id || '',
        email: nextAuthSession.user.email,
        name: nextAuthSession.user.name,
        image: nextAuthSession.user.image,
        provider: 'nextauth',
        raw: { nextauth: nextAuthSession.user },
      },
      provider: 'nextauth',
      expires: nextAuthSession.expires,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    // Don't log "Dynamic server usage" errors as they're expected during static build
    if (errorMessage.includes('Dynamic server usage') || errorMessage.includes('cookies')) {
      return null
    }
    logger.error({ 
      error: errorMessage,
      duration_ms: Date.now() - startTime 
    }, 'Error getting unified session')
    return null
  }
}

/**
 * Get unified user (shorthand for session.user)
 */
export async function getUnifiedUser(): Promise<UnifiedUser | null> {
  const session = await getUnifiedSession()
  return session?.user || null
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getUnifiedSession()
  return session !== null
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<UnifiedSession> {
  const session = await getUnifiedSession()
  
  if (!session) {
    throw new Error('Unauthorized')
  }
  
  return session
}

/**
 * Get user ID from auth
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getUnifiedUser()
  return user?.id || null
}

/**
 * Check if user is authenticated via NextAuth (always true now)
 * @deprecated Use isAuthenticated() instead
 */
export async function isNextAuthUser(): Promise<boolean> {
  return isAuthenticated()
}

/**
 * Check if user is authenticated via Supabase
 * @deprecated Supabase Auth is no longer used
 */
export async function isSupabaseUser(): Promise<boolean> {
  return false
}
