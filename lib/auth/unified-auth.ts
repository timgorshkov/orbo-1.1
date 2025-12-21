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
    const nextAuthSession = await nextAuth();
    
    if (nextAuthSession?.user?.email) {
      // Ищем существующего Supabase пользователя по email
      // чтобы использовать его ID для запросов к базе
      let userId = nextAuthSession.user.id || '';
      
      try {
        const adminSupabase = getAdminSupabase();
        
        // Сначала пробуем найти в auth.users
        const { data: authUsers } = await adminSupabase.auth.admin.listUsers();
        const existingAuthUser = authUsers?.users?.find(
          (u: { email?: string }) => u.email?.toLowerCase() === nextAuthSession.user?.email?.toLowerCase()
        );
        
        if (existingAuthUser) {
          userId = existingAuthUser.id;
          logger.debug({
            email: nextAuthSession.user.email,
            supabase_user_id: userId,
          }, 'Found existing Supabase user for NextAuth email');
        } else {
          logger.debug({
            email: nextAuthSession.user.email,
          }, 'No existing Supabase user found for NextAuth email');
        }
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          email: nextAuthSession.user.email,
        }, 'Error looking up Supabase user for NextAuth session');
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

