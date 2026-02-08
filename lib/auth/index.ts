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
  NextAuthServerProvider,
  createNextAuthServerProvider,
  authenticateWithTelegramCode,
  nextAuthConfigExample 
} from './nextauth';

/**
 * Получить текущий провайдер аутентификации из env
 */
export function getAuthProvider(): AuthProviderType {
  return 'nextauth';
}

/**
 * Создаёт серверный Auth Provider
 * 
 * Используется в Server Components и Route Handlers.
 */
export function createServerAuth(): AuthProvider {
  return createNextAuthServerProvider();
}

/**
 * Создаёт браузерный Auth Provider
 * 
 * Используется в Client Components.
 */
export function createBrowserAuth(): any {
  throw new Error('Browser auth is handled by NextAuth - use next-auth/react signIn/signOut');
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

