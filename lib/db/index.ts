/**
 * Database Abstraction Layer - Entry Point
 * 
 * Provides a unified interface for database operations.
 * Uses local PostgreSQL (via pg library) for all queries.
 * 
 * Usage:
 * ```typescript
 * import { createServerDb, createAdminDb } from '@/lib/db';
 * 
 * // In Server Component or Route Handler
 * const db = await createServerDb();
 * const { data, error } = await db.from('users').select('*').eq('id', userId);
 * 
 * // For admin operations (same client for PostgreSQL)
 * const adminDb = createAdminDb();
 * ```
 */

import type { DbClient, DbProvider } from './types';

// Реэкспорт типов
export type { DbClient, QueryBuilder, DbResult, DbError, DbConfig, DbProvider } from './types';

// PostgreSQL клиент экспортируется отдельно через динамический импорт
// чтобы избежать bundling в Edge Runtime
// Используйте: import { getPostgresClient } from '@/lib/db/postgres-client'

/**
 * Получить текущий провайдер БД из env
 * Always returns 'postgres' — Supabase has been removed.
 */
export function getDbProvider(): DbProvider {
  return 'postgres';
}

/**
 * Создаёт серверный клиент БД
 * 
 * Используется в Server Components и Route Handlers.
 * PostgreSQL не использует RLS — проверка прав должна быть в коде приложения.
 */
export async function createServerDb(): Promise<DbClient> {
  const { getPostgresClient } = await import('./postgres-client');
  return getPostgresClient();
}

/**
 * Создаёт админский клиент БД
 * 
 * Для PostgreSQL это тот же клиент, что и createServerDb().
 * Используется в cron jobs, webhooks, внутренних сервисах.
 */
export async function createAdminDb(): Promise<DbClient> {
  const { getPostgresClient } = await import('./postgres-client');
  return getPostgresClient();
}

// ============================================
// Backwards compatibility (deprecated)
// ============================================

/**
 * @deprecated Используйте createServerDb() вместо этого
 */
export const createClientServer = createServerDb;

/**
 * @deprecated Используйте createAdminDb() вместо этого
 */
export const createAdminServer = createAdminDb;
