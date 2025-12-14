/**
 * Database Abstraction Layer - Entry Point
 * 
 * Этот файл предоставляет единый интерфейс для работы с БД.
 * Переключение между провайдерами происходит через env переменную DB_PROVIDER.
 * 
 * Использование:
 * ```typescript
 * import { createServerDb, createAdminDb } from '@/lib/db';
 * 
 * // В Server Component или Route Handler
 * const db = await createServerDb();
 * const { data, error } = await db.from('users').select('*').eq('id', userId);
 * 
 * // Для админских операций (bypass RLS)
 * const adminDb = createAdminDb();
 * ```
 */

import type { DbClient, DbProvider } from './types';
import { 
  createSupabaseServerClient, 
  createSupabaseAdminClient,
  SupabaseDbClient 
} from './supabase-client';

// Реэкспорт типов
export type { DbClient, QueryBuilder, DbResult, DbError, DbConfig, DbProvider } from './types';
export { SupabaseDbClient } from './supabase-client';

// PostgreSQL клиент экспортируется отдельно через динамический импорт
// чтобы избежать bundling в Edge Runtime
// Используйте: import { getPostgresClient } from '@/lib/db/postgres-client'

/**
 * Получить текущий провайдер БД из env
 */
export function getDbProvider(): DbProvider {
  const provider = process.env.DB_PROVIDER as DbProvider;
  return provider || 'supabase';
}

/**
 * Создаёт серверный клиент БД с учётом текущего пользователя (RLS)
 * 
 * Используется в Server Components и Route Handlers где нужна
 * проверка прав доступа на уровне БД.
 * 
 * ⚠️ Для PostgreSQL без Supabase RLS не работает на уровне БД,
 * проверка прав должна быть в коде приложения.
 */
export async function createServerDb(): Promise<DbClient> {
  const provider = getDbProvider();
  
  switch (provider) {
    case 'supabase':
      return createSupabaseServerClient();
    
    case 'postgres':
    case 'neon':
      // PostgreSQL клиент (Selectel, Neon, Railway и др.)
      // Динамический импорт для избежания bundling в Edge Runtime
      const { getPostgresClient } = await import('./postgres-client');
      return getPostgresClient();
    
    default:
      throw new Error(`Unknown DB provider: ${provider}`);
  }
}

/**
 * Создаёт админский клиент БД (bypass RLS)
 * 
 * Используется для операций, которые требуют полного доступа к данным,
 * например в cron jobs, webhooks, или внутренних сервисах.
 * 
 * Для PostgreSQL это тот же клиент, что и createServerDb().
 */
export async function createAdminDb(): Promise<DbClient> {
  const provider = getDbProvider();
  
  switch (provider) {
    case 'supabase':
      return createSupabaseAdminClient();
    
    case 'postgres':
    case 'neon':
      // PostgreSQL клиент - динамический импорт
      const { getPostgresClient } = await import('./postgres-client');
      return getPostgresClient();
    
    default:
      throw new Error(`Unknown DB provider: ${provider}`);
  }
}

/**
 * Хелпер для получения Supabase клиента напрямую
 * (для auth, storage и других Supabase-специфичных операций)
 * 
 * ⚠️ Используйте только когда нужны специфичные Supabase функции!
 */
export async function getSupabaseClient() {
  const db = await createSupabaseServerClient();
  return db.getSupabaseClient();
}

/**
 * Хелпер для получения админского Supabase клиента
 * 
 * ⚠️ Используйте только когда нужны специфичные Supabase функции!
 */
export function getSupabaseAdminClient() {
  const db = createSupabaseAdminClient();
  return db.getSupabaseClient();
}

// ============================================
// Обратная совместимость (deprecated)
// ============================================

/**
 * @deprecated Используйте createServerDb() вместо этого
 */
export const createClientServer = createServerDb;

/**
 * @deprecated Используйте createAdminDb() вместо этого
 */
export const createAdminServer = createAdminDb;

