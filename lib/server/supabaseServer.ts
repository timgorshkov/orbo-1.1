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
 * Проверяет, содержит ли select-строка JOIN синтаксис
 */
function hasJoinSyntax(columns?: string): boolean {
  if (!columns) return false;
  return columns.includes('(') || columns.includes('!inner') || columns.includes('!left');
}

/**
 * Создаёт smart wrapper для QueryBuilder, который:
 * - Перехватывает .select() с JOIN синтаксисом
 * - Направляет простые запросы на PostgreSQL
 * - Направляет сложные запросы (с JOIN) на Supabase
 */
function createSmartQueryBuilder(table: string, pgClient: any, supabaseClient: SupabaseClient) {
  // Отслеживаем какой провайдер использовать
  let providerDecided = false;
  let useSupabase = false;
  
  const getBuilder = () => {
    if (useSupabase) {
      return supabaseClient.from(table);
    }
    return pgClient.from(table);
  };
  
  // Создаём цепочку вызовов, которая решает провайдер при .select()
  const chainProxy = (currentBuilder: any): any => {
    return new Proxy(currentBuilder, {
      get(target: any, prop: string | symbol) {
        // Перехватываем .select() для определения провайдера
        if (prop === 'select' && !providerDecided) {
          return (columns?: string, options?: any) => {
            providerDecided = true;
            
            if (hasJoinSyntax(columns)) {
              useSupabase = true;
              logger.debug({ table, provider: 'supabase' }, 'Complex query with JOINs routed to Supabase');
              const newBuilder = supabaseClient.from(table).select(columns, options);
              return chainProxy(newBuilder);
            }
            
            // Простые запросы идут на PostgreSQL (не логируем для уменьшения шума)
            const newBuilder = pgClient.from(table).select(columns, options);
            return chainProxy(newBuilder);
          };
        }
        
        const value = target[prop];
        
        // Если это then/catch - возвращаем как есть (конец цепочки)
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return value?.bind?.(target);
        }
        
        if (typeof value === 'function') {
          return (...args: any[]) => {
            const result = value.apply(target, args);
            // Продолжаем проксировать для цепочки методов
            if (result && typeof result === 'object') {
              return chainProxy(result);
            }
            return result;
          };
        }
        
        return value;
      }
    });
  };
  
  // Возвращаем начальный прокси на pgBuilder (будет заменён после select)
  return chainProxy(pgClient.from(table));
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
