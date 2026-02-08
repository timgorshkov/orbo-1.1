/**
 * Database Server Utilities
 * 
 * Provides database client for the application:
 * - .from() and .rpc() route to local PostgreSQL
 * - Storage is handled by Selectel S3 (see lib/storage)
 * - Auth is handled by NextAuth.js (see lib/auth/unified-auth.ts)
 * 
 * NOTE: This file was previously named "supabaseServer" and used a Supabase proxy.
 * Since January 2026, the application uses only local PostgreSQL.
 * The file name is kept for backwards compatibility with 180+ import sites.
 */

import { getPostgresClient } from '@/lib/db/postgres-client'

// Кэш для PostgreSQL клиента
let pgClient: any = null;

function getOrCreatePgClient() {
  if (!pgClient) {
    pgClient = getPostgresClient();
  }
  return pgClient;
}

/**
 * Создаёт серверный клиент для работы с БД
 * Используется в Server Components и Route Handlers
 * 
 * @returns PostgresDbClient instance
 */
export async function createClientServer() {
  return getOrCreatePgClient();
}

/**
 * Создаёт админский клиент для работы с БД (bypass RLS)
 * Используется в cron jobs, webhooks, внутренних сервисах
 * 
 * Для PostgreSQL это тот же клиент, что и createClientServer()
 * (PostgreSQL не использует RLS в этом проекте)
 * 
 * @returns PostgresDbClient instance
 */
export function createAdminServer() {
  return getOrCreatePgClient();
}

// ============================================
// Deprecated exports (kept for backwards compatibility)
// These were used to access Supabase directly — no longer needed
// ============================================

/**
 * @deprecated Supabase removed. Use createAdminServer() instead.
 * This function now returns the PostgreSQL client.
 */
export function getSupabaseAdminClient() {
  return getOrCreatePgClient();
}

/**
 * @deprecated Supabase removed. Use createClientServer() instead.
 * This function now returns the PostgreSQL client.
 */
export async function getSupabaseClient() {
  return getOrCreatePgClient();
}
