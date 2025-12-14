/**
 * Auth Abstraction Layer - Entry Point
 * 
 * Единый интерфейс для работы с аутентификацией.
 * Переключение между провайдерами через env переменную AUTH_PROVIDER.
 * 
 * Использование:
 * ```typescript
 * // В Server Component или Route Handler
 * import { createServerAuth } from '@/lib/auth';
 * const auth = createServerAuth();
 * const { data: user } = await auth.getUser();
 * 
 * // В Client Component
 * import { createBrowserAuth } from '@/lib/auth';
 * const auth = createBrowserAuth();
 * await auth.signInWithOtp({ email: 'user@example.com' });
 * ```
 */

import type { AuthProvider, AuthProviderType } from './types';
import { 
  createSupabaseServerAuth, 
  createSupabaseBrowserAuth,
  SupabaseBrowserAuthProvider
} from './supabase-auth';
import { 
  createNextAuthServerProvider, 
  NextAuthServerProvider,
  authenticateWithTelegramCode 
} from './nextauth';

// Реэкспорт типов
export type { 
  AuthProvider, 
  AuthUser, 
  AuthSession, 
  AuthResult, 
  AuthError,
  OtpOptions,
  OAuthOptions,
  AuthProviderType,
  AuthConfig 
} from './types';

export { 
  SupabaseServerAuthProvider, 
  SupabaseBrowserAuthProvider 
} from './supabase-auth';

export { 
  NextAuthServerProvider,
  createNextAuthServerProvider,
  authenticateWithTelegramCode,
  nextAuthConfigExample 
} from './nextauth';

/**
 * Получить текущий провайдер аутентификации из env
 */
export function getAuthProvider(): AuthProviderType {
  const provider = process.env.AUTH_PROVIDER as AuthProviderType;
  return provider || 'supabase';
}

/**
 * Создаёт серверный Auth Provider
 * 
 * Используется в Server Components и Route Handlers.
 */
export function createServerAuth(): AuthProvider {
  const provider = getAuthProvider();
  
  switch (provider) {
    case 'supabase':
      return createSupabaseServerAuth();
    
    case 'nextauth':
      // NextAuth.js v5 провайдер
      return createNextAuthServerProvider();
    
    case 'lucia':
      // TODO: Реализовать Lucia провайдер
      throw new Error('Lucia provider not yet implemented');
    
    case 'custom':
      // TODO: Реализовать Custom JWT провайдер
      throw new Error('Custom JWT provider not yet implemented');
    
    default:
      throw new Error(`Unknown auth provider: ${provider}`);
  }
}

/**
 * Создаёт браузерный Auth Provider
 * 
 * Используется в Client Components.
 */
export function createBrowserAuth(): SupabaseBrowserAuthProvider {
  const provider = getAuthProvider();
  
  switch (provider) {
    case 'supabase':
      return createSupabaseBrowserAuth();
    
    case 'nextauth':
      throw new Error('NextAuth browser provider not yet implemented');
    
    case 'lucia':
      throw new Error('Lucia browser provider not yet implemented');
    
    case 'custom':
      throw new Error('Custom JWT browser provider not yet implemented');
    
    default:
      throw new Error(`Unknown auth provider: ${provider}`);
  }
}

// ============================================
// Хелперы для быстрого доступа
// ============================================

/**
 * Быстрый хелпер для получения текущего пользователя (server-side)
 */
export async function getCurrentUser() {
  const auth = createServerAuth();
  return auth.getUser();
}

/**
 * Быстрый хелпер для получения текущей сессии (server-side)
 */
export async function getCurrentSession() {
  const auth = createServerAuth();
  return auth.getSession();
}

/**
 * Проверяет, авторизован ли пользователь (server-side)
 */
export async function isAuthenticated(): Promise<boolean> {
  const { data: user, error } = await getCurrentUser();
  return !error && !!user;
}

/**
 * Требует авторизации, выбрасывает ошибку если не авторизован
 */
export async function requireAuth() {
  const { data: user, error } = await getCurrentUser();
  
  if (error || !user) {
    throw new Error('Unauthorized');
  }
  
  return user;
}

