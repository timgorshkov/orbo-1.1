/**
 * Supabase Server Utilities - Hybrid Mode
 * 
 * Этот файл создаёт "гибридный" клиент:
 * - .from() и .rpc() направляются на локальный PostgreSQL (когда DB_PROVIDER=postgres)
 * - .auth и .storage продолжают использовать Supabase
 * 
 * Это позволяет мигрировать БД без изменения существующего кода.
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getDbProvider } from '@/lib/db'
import { getPostgresClient } from '@/lib/db/postgres-client'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SupabaseServer');

// Кэш для PostgreSQL клиента
let pgClient: any = null;

function getOrCreatePgClient() {
  if (!pgClient) {
    pgClient = getPostgresClient();
  }
  return pgClient;
}

/**
 * Создаёт smart wrapper для QueryBuilder, который:
 * - Перехватывает .select() с JOIN синтаксисом
 * - Направляет простые запросы на PostgreSQL
 * - Направляет сложные запросы (с JOIN) на Supabase
 */
function createSmartQueryBuilder(table: string, pgClient: any, supabaseClient: SupabaseClient) {
  const pgBuilder = pgClient.from(table);
  const supabaseBuilder = supabaseClient.from(table);
  
  let useSupabase = false;
  let currentBuilder = pgBuilder;
  
  // Создаём Proxy для отслеживания .select() с joins
  return new Proxy(pgBuilder, {
    get(target: any, prop: string | symbol) {
      // Перехватываем .select() чтобы проверить на joins
      if (prop === 'select') {
        return (columns?: string, options?: any) => {
          // Проверяем есть ли JOIN синтаксис (скобки или !inner)
          if (columns && (columns.includes('(') || columns.includes('!inner') || columns.includes('!left'))) {
            useSupabase = true;
            currentBuilder = supabaseBuilder.select(columns, options);
            logger.debug({ table, columns, provider: 'supabase' }, 'Complex query with JOINs routed to Supabase');
            return createForwardingProxy(currentBuilder);
          }
          
          // Простой select - используем PostgreSQL
          currentBuilder = pgBuilder.select(columns, options);
          return createForwardingProxy(currentBuilder);
        };
      }
      
      // Для всех остальных методов - используем текущий builder
      const value = target[prop];
      if (typeof value === 'function') {
        return (...args: any[]) => {
          const result = value.apply(target, args);
          return createForwardingProxy(result);
        };
      }
      return value;
    }
  });
}

/**
 * Создаёт простой proxy для пробрасывания вызовов
 */
function createForwardingProxy(builder: any) {
  return new Proxy(builder, {
    get(target: any, prop: string | symbol) {
      const value = target[prop];
      if (typeof value === 'function') {
        return (...args: any[]) => {
          const result = value.apply(target, args);
          // Если результат - объект с методами, продолжаем проксировать
          if (result && typeof result === 'object' && !result.then) {
            return createForwardingProxy(result);
          }
          return result;
        };
      }
      return value;
    }
  });
}

/**
 * Создаёт Proxy-обёртку вокруг Supabase клиента,
 * которая перенаправляет DB операции на PostgreSQL
 */
function createHybridClient(supabaseClient: SupabaseClient): SupabaseClient {
  const provider = getDbProvider();
  
  // Если провайдер не postgres, возвращаем оригинальный клиент
  if (provider !== 'postgres') {
    return supabaseClient;
  }
  
  const pg = getOrCreatePgClient();
  
  return new Proxy(supabaseClient, {
    get(target, prop: string | symbol) {
      // Перенаправляем .from() через smart wrapper
      if (prop === 'from') {
        return (table: string) => {
          return createSmartQueryBuilder(table, pg, supabaseClient);
        };
      }
      
      // Перенаправляем .rpc() на PostgreSQL
      if (prop === 'rpc') {
        return (fn: string, params?: Record<string, any>) => {
          logger.debug({ function: fn, provider: 'postgres' }, 'RPC call routed to PostgreSQL');
          return pg.rpc(fn, params);
        };
      }
      
      // Все остальные методы (auth, storage, channel, etc.) идут в Supabase
      const value = (target as any)[prop];
      
      // Если это функция, привязываем контекст
      if (typeof value === 'function') {
        return value.bind(target);
      }
      
      return value;
    }
  }) as SupabaseClient;
}

/**
 * Создаёт серверный клиент с cookies для аутентификации
 * 
 * DB операции идут на PostgreSQL (если DB_PROVIDER=postgres)
 * Auth операции идут на Supabase
 */
export async function createClientServer() {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: name => cookieStore.get(name)?.value,
        set: (name, value, opts) => {
          try {
            cookieStore.set({ name, value, ...opts })
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
        remove: (name, opts) => {
          try {
            cookieStore.set({ name, value: "", ...opts })
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
      }
    }
  )
  
  return createHybridClient(supabase);
}

/**
 * Создаёт админский клиент (bypass RLS)
 * 
 * DB операции идут на PostgreSQL (если DB_PROVIDER=postgres)
 * Auth/Storage операции идут на Supabase
 */
export function createAdminServer() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  
  return createHybridClient(supabase);
}

// ============================================
// Хелперы для прямого доступа к Supabase
// (когда нужен именно Supabase, а не абстракция)
// ============================================

/**
 * Получить оригинальный Supabase клиент (без Proxy)
 * Используйте для Supabase-специфичных операций: realtime, storage, etc.
 */
export async function getSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: name => cookieStore.get(name)?.value,
        set: (name, value, opts) => {
          try {
            cookieStore.set({ name, value, ...opts })
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
        remove: (name, opts) => {
          try {
            cookieStore.set({ name, value: "", ...opts })
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
      }
    }
  )
}

/**
 * Получить оригинальный Supabase Admin клиент (без Proxy)
 */
export function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
