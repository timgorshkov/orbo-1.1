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
      logger.debug({ email, supabase_user_id: foundUserId }, 'Found Supabase user via RPC');
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
        logger.debug({ email, supabase_user_id: userData.user.id }, 'Found Supabase user by ID');
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
 * Helper function to check NextAuth session
 * Extracted for reuse and to avoid duplicate code
 */
async function checkNextAuthSession(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<UnifiedSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextAuthSession: any = null;
  try {
    const authResult = await nextAuth();
    if (authResult && typeof authResult === 'object' && 'user' in authResult) {
      nextAuthSession = authResult;
    }
  } catch (authError) {
    logger.warn({
      error: authError instanceof Error ? authError.message : String(authError),
    }, 'NextAuth auth() failed');
    return null;
  }
  
  if (!nextAuthSession?.user?.email) {
    return null;
  }
  
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

/**
 * Get unified session from either Supabase or NextAuth
 * Prefers Supabase session if both are present (for backward compatibility)
 * ⚡ ОПТИМИЗАЦИЯ: Проверяем cookies сначала, чтобы избежать лишних сетевых вызовов
 */
export async function getUnifiedSession(): Promise<UnifiedSession | null> {
  try {
    const cookieStore = await cookies();
    
    // ⚡ ОПТИМИЗАЦИЯ: Быстрая проверка наличия cookies без сетевых вызовов
    const hasSupabaseCookies = cookieStore.getAll().some(c => 
      c.name.includes('sb-') && c.name.includes('-auth-token')
    );
    const hasNextAuthCookies = cookieStore.get('authjs.session-token') || 
                               cookieStore.get('__Secure-authjs.session-token');
    
    // Если нет ни одной auth cookie - сразу возвращаем null
    if (!hasSupabaseCookies && !hasNextAuthCookies) {
      return null;
    }
    
    // Если есть только NextAuth cookies - сразу проверяем NextAuth (пропускаем Supabase)
    if (!hasSupabaseCookies && hasNextAuthCookies) {
      return await checkNextAuthSession(cookieStore);
    }
    
    // 1. Check Supabase session (primary)
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

    // Используем getUser() вместо getSession() для безопасной верификации
    // getUser() проверяет токен на сервере Supabase Auth
    const { data: { user: supabaseUser }, error: userError } = await supabase.auth.getUser();
    
    if (supabaseUser && !userError) {
      // Получаем session только для access_token (если нужен)
      const { data: { session: supabaseSession } } = await supabase.auth.getSession();
      
      return {
        user: {
          id: supabaseUser.id,
          email: supabaseUser.email,
          name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0],
          image: supabaseUser.user_metadata?.avatar_url,
          provider: 'supabase',
          raw: { supabase: supabaseUser },
        },
        provider: 'supabase',
        expires: supabaseSession?.expires_at 
          ? new Date(supabaseSession.expires_at * 1000).toISOString()
          : undefined,
        accessToken: supabaseSession?.access_token,
      };
    }

    // 2. Check NextAuth session (fallback) - только если есть cookie
    if (hasNextAuthCookies) {
      return await checkNextAuthSession(cookieStore);
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

