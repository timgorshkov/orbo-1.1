/**
 * Unified Auth Layer
 * 
 * Объединяет Supabase Auth и NextAuth.js для работы с обоими провайдерами.
 * Позволяет постепенно мигрировать с Supabase на независимую OAuth авторизацию.
 * 
 * Использование:
 * ```typescript
 * import { getUnifiedSession, getUnifiedUser } from '@/lib/auth/unified-auth';
 * 
 * // В Server Component или Route Handler
 * const session = await getUnifiedSession();
 * if (session) {
 *   console.log('Authenticated via:', session.provider);
 *   console.log('User:', session.user);
 * }
 * ```
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { auth as nextAuth } from '@/auth';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('UnifiedAuth');

// Создаём admin client для поиска пользователей по email
function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Look up Supabase user ID by email
 * Uses RPC function get_user_id_by_email if available
 */
async function lookupSupabaseUserByEmail(email: string, nextAuthId?: string): Promise<string | null> {
  const adminSupabase = getAdminSupabase();
  
  logger.debug({ email, nextauth_id: nextAuthId }, 'Looking up Supabase user');
  
  // Метод 1: Используем RPC функцию (самый быстрый и надежный)
  try {
    const { data: foundUserId, error: rpcError } = await adminSupabase
      .rpc('get_user_id_by_email', { p_email: email });
    
    if (!rpcError && foundUserId) {
      logger.info({ email, supabase_user_id: foundUserId }, 'Found Supabase user via RPC');
      return foundUserId;
    }
    
    if (rpcError) {
      logger.debug({ error: rpcError.message, email }, 'RPC failed, function may not exist');
    }
  } catch (e) {
    logger.debug({ error: e instanceof Error ? e.message : String(e) }, 'RPC call failed');
  }
  
  // Метод 2: Fallback - проверяем по NextAuth ID (на случай если уже создан)
  if (nextAuthId) {
    try {
      const { data: userData, error: userError } = await adminSupabase.auth.admin.getUserById(nextAuthId);
      if (!userError && userData?.user) {
        logger.info({ email, supabase_user_id: userData.user.id }, 'Found Supabase user by ID');
        return userData.user.id;
      }
    } catch (e) {
      // Игнорируем
    }
  }
  
  logger.debug({ email }, 'No Supabase user found');
  return null;
}

/**
 * Unified user representation
 */
export interface UnifiedUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  provider: 'supabase' | 'nextauth';
  raw: {
    supabase?: any;
    nextauth?: any;
  };
}

/**
 * Unified session representation
 */
export interface UnifiedSession {
  user: UnifiedUser;
  provider: 'supabase' | 'nextauth';
  expires?: string;
  accessToken?: string;
}

// Кэш для user ID lookup (в памяти процесса)
const userIdCache = new Map<string, { userId: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

/**
 * Get unified session from either Supabase or NextAuth
 * Prefers Supabase session if both are present (for backward compatibility)
 */
export async function getUnifiedSession(): Promise<UnifiedSession | null> {
  try {
    // 1. Check Supabase session first (primary)
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {
            // Read-only in this context
          },
          remove() {
            // Read-only in this context
          },
        },
      }
    );

    const { data: { session: supabaseSession } } = await supabase.auth.getSession();
    
    if (supabaseSession?.user) {
      return {
        user: {
          id: supabaseSession.user.id,
          email: supabaseSession.user.email,
          name: supabaseSession.user.user_metadata?.full_name || supabaseSession.user.email?.split('@')[0],
          image: supabaseSession.user.user_metadata?.avatar_url,
          provider: 'supabase',
          raw: { supabase: supabaseSession.user },
        },
        provider: 'supabase',
        expires: supabaseSession.expires_at 
          ? new Date(supabaseSession.expires_at * 1000).toISOString()
          : undefined,
        accessToken: supabaseSession.access_token,
      };
    }

    // 2. Check NextAuth session (fallback)
    // Обёрнуто в try-catch для обработки UntrustedHost ошибки
    let nextAuthSession: Awaited<ReturnType<typeof nextAuth>> | null = null;
    try {
      nextAuthSession = await nextAuth();
    } catch (authError) {
      // UntrustedHost или другая ошибка NextAuth
      logger.warn({
        error: authError instanceof Error ? authError.message : String(authError),
      }, 'NextAuth auth() failed, checking cookies directly');
      
      // Fallback: проверяем наличие session cookie
      const hasSessionCookie = cookieStore.get('authjs.session-token') || 
                               cookieStore.get('__Secure-authjs.session-token');
      if (hasSessionCookie) {
        logger.debug({}, 'Found NextAuth session cookie but auth() failed');
        // Не можем получить данные сессии без auth(), возвращаем null
        // Пользователю придётся перелогиниться
      }
    }
    
    if (nextAuthSession?.user?.email) {
      const userEmail = nextAuthSession.user.email.toLowerCase();
      let userId = nextAuthSession.user.id || '';
      
      // Проверяем кэш для быстрого ответа
      const cached = userIdCache.get(userEmail);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        userId = cached.userId;
        logger.debug({ email: userEmail, cached_user_id: userId }, 'Using cached Supabase user ID');
      } else {
        // Ищем существующего Supabase пользователя по email (с таймаутом)
        try {
          const lookupPromise = lookupSupabaseUserByEmail(userEmail, nextAuthSession.user.id);
          const timeoutPromise = new Promise<string | null>((_, reject) => 
            setTimeout(() => reject(new Error('User lookup timeout')), 3000)
          );
          
          const supabaseUserId = await Promise.race([lookupPromise, timeoutPromise]);
          
          if (supabaseUserId) {
            userId = supabaseUserId;
            userIdCache.set(userEmail, { userId, timestamp: Date.now() });
          }
        } catch (error) {
          logger.warn({
            error: error instanceof Error ? error.message : String(error),
            email: userEmail,
          }, 'User lookup failed or timed out, using NextAuth ID');
        }
      }
      
      return {
        user: {
          id: userId,
          email: nextAuthSession.user.email,
          name: nextAuthSession.user.name,
          image: nextAuthSession.user.image,
          provider: 'nextauth',
          raw: { nextauth: nextAuthSession.user },
        },
        provider: 'nextauth',
        expires: nextAuthSession.expires,
      };
    }

    return null;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Error getting unified session');
    return null;
  }
}

/**
 * Get unified user (shorthand for session.user)
 */
export async function getUnifiedUser(): Promise<UnifiedUser | null> {
  const session = await getUnifiedSession();
  return session?.user || null;
}

/**
 * Check if user is authenticated via any provider
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getUnifiedSession();
  return session !== null;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<UnifiedSession> {
  const session = await getUnifiedSession();
  
  if (!session) {
    throw new Error('Unauthorized');
  }
  
  return session;
}

/**
 * Get user ID from any auth provider
 * Useful for database queries
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getUnifiedUser();
  return user?.id || null;
}

/**
 * Check if user is authenticated via NextAuth (OAuth)
 * Useful for determining if user needs to be synced to Supabase
 */
export async function isNextAuthUser(): Promise<boolean> {
  const session = await getUnifiedSession();
  return session?.provider === 'nextauth';
}

/**
 * Check if user is authenticated via Supabase
 */
export async function isSupabaseUser(): Promise<boolean> {
  const session = await getUnifiedSession();
  return session?.provider === 'supabase';
}

