/**
 * Database Abstraction Layer - Types
 * 
 * Этот файл определяет интерфейсы для абстракции работы с базой данных.
 * Позволяет легко переключаться между Supabase, чистым PostgreSQL или другими БД.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/**
 * Результат запроса к БД
 */
export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
  count?: number | null;
}

/**
 * Ошибка БД
 */
export interface DbError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Опции для SELECT запроса
 */
export interface SelectOptions {
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
}

/**
 * Опции для upsert
 */
export interface UpsertOptions {
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

/**
 * Интерфейс Query Builder для построения запросов
 */
export interface QueryBuilder<T = any> {
  select(columns?: string, options?: SelectOptions): QueryBuilder<T>;
  insert(values: Partial<T> | Partial<T>[]): QueryBuilder<T>;
  update(values: Partial<T>): QueryBuilder<T>;
  upsert(values: Partial<T> | Partial<T>[], options?: UpsertOptions): QueryBuilder<T>;
  delete(): QueryBuilder<T>;
  
  // Фильтры
  eq(column: string, value: any): QueryBuilder<T>;
  neq(column: string, value: any): QueryBuilder<T>;
  gt(column: string, value: any): QueryBuilder<T>;
  gte(column: string, value: any): QueryBuilder<T>;
  lt(column: string, value: any): QueryBuilder<T>;
  lte(column: string, value: any): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  is(column: string, value: null | boolean): QueryBuilder<T>;
  in(column: string, values: any[]): QueryBuilder<T>;
  contains(column: string, value: any): QueryBuilder<T>;
  containedBy(column: string, value: any): QueryBuilder<T>;
  not(column: string, operator: string, value: any): QueryBuilder<T>;
  or(filters: string): QueryBuilder<T>;
  filter(column: string, operator: string, value: any): QueryBuilder<T>;
  
  // Модификаторы
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  range(from: number, to: number): QueryBuilder<T>;
  abortSignal(signal: AbortSignal): QueryBuilder<T>;
  
  // Результат
  single(): Promise<DbResult<T>>;
  maybeSingle(): Promise<DbResult<T | null>>;
  then<TResult>(
    onfulfilled?: (value: DbResult<T[]>) => TResult | PromiseLike<TResult>
  ): Promise<TResult>;
}

/**
 * Основной интерфейс клиента БД
 */
export interface DbClient {
  /**
   * Создаёт query builder для таблицы
   */
  from<T = any>(table: string): QueryBuilder<T>;
  
  /**
   * Вызывает RPC функцию (хранимую процедуру)
   * Возвращает объект с методами single(), maybeSingle(), then() для совместимости с Supabase API
   */
  rpc<T = any>(
    functionName: string, 
    params?: Record<string, any>,
    options?: { count?: 'exact' | 'planned' | 'estimated' }
  ): {
    single: () => Promise<DbResult<T>>;
    maybeSingle: () => Promise<DbResult<T | null>>;
    then: <TResult>(onfulfilled?: (value: DbResult<T[]>) => TResult | PromiseLike<TResult>) => Promise<TResult>;
  };
  
  /**
   * Выполняет raw SQL запрос (для миграций и сложных запросов)
   */
  raw<T = any>(sql: string, params?: any[]): Promise<DbResult<T[]>>;
}

/**
 * Тип провайдера БД
 */
export type DbProvider = 'supabase' | 'postgres' | 'neon';

/**
 * Конфигурация БД
 */
export interface DbConfig {
  provider: DbProvider;
  url: string;
  anonKey?: string;        // Для Supabase
  serviceRoleKey?: string; // Для Supabase admin
  maxConnections?: number; // Для PostgreSQL pool
}

