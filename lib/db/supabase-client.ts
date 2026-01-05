/**
 * Supabase Implementation of Database Client
 * 
 * Это текущая реализация, работающая с Supabase.
 * При миграции на другую БД, нужно будет создать новую реализацию.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from "next/headers";
import type { DbClient, QueryBuilder, DbResult, DbError, SelectOptions, UpsertOptions } from './types';
import { createServiceLogger } from '../logger';

/**
 * Адаптер для преобразования Supabase QueryBuilder в наш интерфейс
 */
class SupabaseQueryBuilder<T = any> implements QueryBuilder<T> {
  private query: any;

  constructor(query: any) {
    this.query = query;
  }

  select(columns?: string, options?: SelectOptions): QueryBuilder<T> {
    this.query = this.query.select(columns || '*', options);
    return this;
  }

  insert(values: Partial<T> | Partial<T>[]): QueryBuilder<T> {
    this.query = this.query.insert(values);
    return this;
  }

  update(values: Partial<T>): QueryBuilder<T> {
    this.query = this.query.update(values);
    return this;
  }

  upsert(values: Partial<T> | Partial<T>[], options?: UpsertOptions): QueryBuilder<T> {
    this.query = this.query.upsert(values, options);
    return this;
  }

  delete(): QueryBuilder<T> {
    this.query = this.query.delete();
    return this;
  }

  eq(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.eq(column, value);
    return this;
  }

  neq(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.neq(column, value);
    return this;
  }

  gt(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.gt(column, value);
    return this;
  }

  gte(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.gte(column, value);
    return this;
  }

  lt(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.lt(column, value);
    return this;
  }

  lte(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.lte(column, value);
    return this;
  }

  like(column: string, pattern: string): QueryBuilder<T> {
    this.query = this.query.like(column, pattern);
    return this;
  }

  ilike(column: string, pattern: string): QueryBuilder<T> {
    this.query = this.query.ilike(column, pattern);
    return this;
  }

  is(column: string, value: null | boolean): QueryBuilder<T> {
    this.query = this.query.is(column, value);
    return this;
  }

  in(column: string, values: any[]): QueryBuilder<T> {
    this.query = this.query.in(column, values);
    return this;
  }

  contains(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.contains(column, value);
    return this;
  }

  containedBy(column: string, value: any): QueryBuilder<T> {
    this.query = this.query.containedBy(column, value);
    return this;
  }

  not(column: string, operator: string, value: any): QueryBuilder<T> {
    this.query = this.query.not(column, operator, value);
    return this;
  }

  or(filters: string): QueryBuilder<T> {
    this.query = this.query.or(filters);
    return this;
  }

  filter(column: string, operator: string, value: any): QueryBuilder<T> {
    this.query = this.query.filter(column, operator, value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder<T> {
    this.query = this.query.order(column, options);
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this.query = this.query.limit(count);
    return this;
  }

  range(from: number, to: number): QueryBuilder<T> {
    this.query = this.query.range(from, to);
    return this;
  }

  abortSignal(signal: AbortSignal): QueryBuilder<T> {
    this.query = this.query.abortSignal(signal);
    return this;
  }

  async single(): Promise<DbResult<T>> {
    const result = await this.query.single();
    return this.transformResult(result);
  }

  async maybeSingle(): Promise<DbResult<T | null>> {
    const result = await this.query.maybeSingle();
    return this.transformResult(result);
  }

  async then<TResult>(
    onfulfilled?: (value: DbResult<T[]>) => TResult | PromiseLike<TResult>
  ): Promise<TResult> {
    const result = await this.query;
    const transformed = this.transformResult(result);
    if (onfulfilled) {
      return onfulfilled(transformed as DbResult<T[]>);
    }
    return transformed as unknown as TResult;
  }

  private transformResult(result: any): DbResult<any> {
    return {
      data: result.data,
      error: result.error ? {
        message: result.error.message,
        code: result.error.code,
        details: result.error.details,
        hint: result.error.hint
      } : null,
      count: result.count
    };
  }
}

/**
 * Supabase реализация DbClient
 */
export class SupabaseDbClient implements DbClient {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  from<T = any>(table: string): QueryBuilder<T> {
    return new SupabaseQueryBuilder<T>(this.client.from(table));
  }

  async rpc<T = any>(
    functionName: string,
    params?: Record<string, any>,
    options?: { count?: 'exact' | 'planned' | 'estimated' }
  ): Promise<DbResult<T>> {
    const result = await this.client.rpc(functionName, params, options);
    return {
      data: result.data as T,
      error: result.error ? {
        message: result.error.message,
        code: result.error.code,
        details: result.error.details,
        hint: result.error.hint
      } : null,
      count: result.count
    };
  }

  async raw<T = any>(sql: string, params?: any[]): Promise<DbResult<T[]>> {
    // Supabase не поддерживает raw SQL напрямую через клиент
    // Это заглушка, которая может использоваться через Edge Functions или pg напрямую
    const logger = createServiceLogger('SupabaseDbClient');
    logger.warn({ sql: sql.substring(0, 100) }, 'raw SQL not directly supported in Supabase client, use RPC instead');
    return {
      data: null,
      error: {
        message: 'raw SQL not supported, use RPC function instead',
        code: 'NOT_SUPPORTED'
      }
    };
  }

  /**
   * Получить оригинальный Supabase клиент для специфичных операций
   * (auth, storage и т.д.)
   */
  getSupabaseClient(): SupabaseClient {
    return this.client;
  }
}

/**
 * Создаёт серверный Supabase клиент с cookies (для SSR с RLS)
 */
export async function createSupabaseServerClient(): Promise<SupabaseDbClient> {
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
        remove: (name: string, options: CookieOptions) => {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
      }
    }
  );

  return new SupabaseDbClient(supabase);
}

/**
 * Создаёт админский Supabase клиент (service role, bypasses RLS)
 */
export function createSupabaseAdminClient(): SupabaseDbClient {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  return new SupabaseDbClient(supabase);
}

