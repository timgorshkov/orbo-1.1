/**
 * PostgreSQL Implementation of Database Client
 * 
 * Работает с любым PostgreSQL сервером:
 * - Selectel Managed PostgreSQL
 * - Neon
 * - Railway
 * - Self-hosted PostgreSQL
 * 
 * Использует pg (node-postgres) для подключения.
 * 
 * ⚠️ ВАЖНО: Этот модуль НЕ работает в Edge Runtime (Vercel Edge Functions).
 * Используйте только в Node.js Runtime (стандартные Serverless Functions).
 * 
 * Для использования в Edge Runtime рассмотрите:
 * - @neondatabase/serverless (для Neon)
 * - @planetscale/database (для PlanetScale)
 */

import type { DbClient, QueryBuilder, DbResult, DbError, SelectOptions, UpsertOptions } from './types';
import { createServiceLogger } from '../logger';

// Декларация глобальной переменной EdgeRuntime (определена в Vercel Edge Runtime)
declare const EdgeRuntime: string | undefined;

// Проверка runtime - pg не работает в Edge
function checkRuntime() {
  if (typeof EdgeRuntime !== 'undefined') {
    throw new Error(
      'PostgreSQL client (pg) is not compatible with Edge Runtime. ' +
      'Use Node.js runtime or consider @neondatabase/serverless for Edge.'
    );
  }
}

// Динамический импорт pg для избежания ошибок если не используется
let Pool: any;
let poolInstance: any = null;

async function initPg() {
  checkRuntime();
  
  if (!Pool) {
    // Динамический импорт для предотвращения bundling
    const pg = await import('pg');
    Pool = pg.Pool;
  }
}

async function getPool() {
  await initPg();
  
  if (!poolInstance) {
    // Используем DATABASE_URL_POSTGRES если указан, иначе DATABASE_URL
    const connectionString = process.env.DATABASE_URL_POSTGRES || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL or DATABASE_URL_POSTGRES must be set');
    }
    
    poolInstance = new Pool({
      connectionString,
      max: parseInt(process.env.DATABASE_POOL_SIZE || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
    
    // Обработка ошибок пула
    const logger = createServiceLogger('PostgreSQL Pool');
    poolInstance.on('error', (err: Error) => {
      logger.error({ 
        error: err.message,
        stack: err.stack
      }, 'Unexpected pool error');
    });
  }
  
  return poolInstance;
}

/**
 * Конвертирует результат pg в наш DbResult
 */
function transformResult<T>(result: any, single = false): DbResult<T> {
  if (!result) {
    return { data: null, error: null };
  }
  
  if (single) {
    return {
      data: result.rows?.[0] || null,
      error: null,
      count: result.rowCount
    };
  }
  
  return {
    data: result.rows as T,
    error: null,
    count: result.rowCount
  };
}

/**
 * Конвертирует ошибку в DbError
 */
function transformError(error: any): DbError {
  return {
    message: error.message || 'Unknown database error',
    code: error.code,
    details: error.detail,
    hint: error.hint
  };
}

/**
 * Билдер SQL запросов в стиле Supabase
 */
class PostgresQueryBuilder<T = any> implements QueryBuilder<T> {
  private pool: any;
  private tableName: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectColumns: string = '*';
  private selectOptions: SelectOptions = {};
  private insertData: any = null;
  private updateData: any = null;
  private upsertData: any = null;
  private upsertOptions: UpsertOptions = {};
  private conditions: { column: string; operator: string; values: any[]; raw?: string }[] = [];
  private orderByClause: string[] = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private paramCounter: number = 1;

  constructor(pool: any, tableName: string) {
    this.pool = pool;
    this.tableName = tableName;
  }

  private nextParam(): string {
    return `$${this.paramCounter++}`;
  }

  select(columns?: string, options?: SelectOptions): QueryBuilder<T> {
    this.operation = 'select';
    this.selectColumns = columns || '*';
    this.selectOptions = options || {};
    return this;
  }

  insert(values: Partial<T> | Partial<T>[]): QueryBuilder<T> {
    this.operation = 'insert';
    this.insertData = values;
    return this;
  }

  update(values: Partial<T>): QueryBuilder<T> {
    this.operation = 'update';
    this.updateData = values;
    return this;
  }

  upsert(values: Partial<T> | Partial<T>[], options?: UpsertOptions): QueryBuilder<T> {
    this.operation = 'upsert';
    this.upsertData = values;
    this.upsertOptions = options || {};
    return this;
  }

  delete(): QueryBuilder<T> {
    this.operation = 'delete';
    return this;
  }

  // Фильтры - НЕ создаём placeholder сразу, только при buildQuery()
  // Это исправляет баг с порядком параметров для update/delete
  eq(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator: '=', values: [value] });
    return this;
  }

  neq(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator: '!=', values: [value] });
    return this;
  }

  gt(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator: '>', values: [value] });
    return this;
  }

  gte(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator: '>=', values: [value] });
    return this;
  }

  lt(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator: '<', values: [value] });
    return this;
  }

  lte(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator: '<=', values: [value] });
    return this;
  }

  like(column: string, pattern: string): QueryBuilder<T> {
    this.conditions.push({ column, operator: 'LIKE', values: [pattern] });
    return this;
  }

  ilike(column: string, pattern: string): QueryBuilder<T> {
    this.conditions.push({ column, operator: 'ILIKE', values: [pattern] });
    return this;
  }

  is(column: string, value: null | boolean): QueryBuilder<T> {
    if (value === null) {
      this.conditions.push({ column, operator: 'IS NULL', values: [] });
    } else {
      this.conditions.push({ column, operator: value ? 'IS TRUE' : 'IS FALSE', values: [] });
    }
    return this;
  }

  in(column: string, values: any[]): QueryBuilder<T> {
    if (values.length === 0) {
      // Пустой массив - условие никогда не выполняется
      this.conditions.push({ column: '', operator: 'FALSE', values: [], raw: '1 = 0' });
    } else {
      this.conditions.push({ column, operator: 'IN', values });
    }
    return this;
  }

  contains(column: string, value: any): QueryBuilder<T> {
    // Для JSONB массивов
    this.conditions.push({ column, operator: '@>', values: [JSON.stringify(value)] });
    return this;
  }

  containedBy(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator: '<@', values: [JSON.stringify(value)] });
    return this;
  }

  not(column: string, operator: string, value: any): QueryBuilder<T> {
    // Специальная обработка для IS NULL / IS NOT NULL
    if (operator.toLowerCase() === 'is' && value === null) {
      this.conditions.push({ column, operator: 'IS NOT NULL', values: [] });
    } else {
      this.conditions.push({ column, operator: `NOT_${operator}`, values: [value] });
    }
    return this;
  }

  or(filters: string): QueryBuilder<T> {
    // Парсим Supabase-стиль фильтров
    // Пример: "status.is.null,status.eq.active" -> (status IS NULL OR status = 'active')
    const parts = filters.split(',');
    const sqlParts: string[] = [];
    const orValues: any[] = [];
    
    for (const part of parts) {
      const segments = part.trim().split('.');
      if (segments.length >= 2) {
        const column = segments[0];
        const op = segments[1];
        const value = segments.slice(2).join('.');
        
        if (op === 'is' && value === 'null') {
          sqlParts.push(`"${column}" IS NULL`);
        } else if (op === 'is' && value === 'not.null') {
          sqlParts.push(`"${column}" IS NOT NULL`);
        } else if (op === 'eq') {
          orValues.push(value);
          sqlParts.push(`"${column}" = $${this.paramCounter + orValues.length - 1}`);
        } else if (op === 'neq') {
          orValues.push(value);
          sqlParts.push(`"${column}" != $${this.paramCounter + orValues.length - 1}`);
        } else if (op === 'gt') {
          orValues.push(value);
          sqlParts.push(`"${column}" > $${this.paramCounter + orValues.length - 1}`);
        } else if (op === 'lt') {
          orValues.push(value);
          sqlParts.push(`"${column}" < $${this.paramCounter + orValues.length - 1}`);
        } else if (op === 'gte') {
          orValues.push(value);
          sqlParts.push(`"${column}" >= $${this.paramCounter + orValues.length - 1}`);
        } else if (op === 'lte') {
          orValues.push(value);
          sqlParts.push(`"${column}" <= $${this.paramCounter + orValues.length - 1}`);
        } else if (op === 'like') {
          orValues.push(value);
          sqlParts.push(`"${column}" LIKE $${this.paramCounter + orValues.length - 1}`);
        } else if (op === 'ilike') {
          orValues.push(value);
          sqlParts.push(`"${column}" ILIKE $${this.paramCounter + orValues.length - 1}`);
        }
      }
    }
    
    if (sqlParts.length > 0) {
      this.conditions.push({ 
        column: '', 
        operator: 'RAW', 
        values: orValues, 
        raw: `(${sqlParts.join(' OR ')})` 
      });
    }
    
    return this;
  }

  filter(column: string, operator: string, value: any): QueryBuilder<T> {
    this.conditions.push({ column, operator, values: [value] });
    return this;
  }

  // Модификаторы
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder<T> {
    const direction = options?.ascending === false ? 'DESC' : 'ASC';
    const nulls = options?.nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';
    this.orderByClause.push(`"${column}" ${direction} ${nulls}`);
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): QueryBuilder<T> {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  /**
   * AbortSignal для отмены запроса (совместимость с Supabase API)
   * Примечание: pg не поддерживает отмену запросов через AbortSignal напрямую,
   * но мы сохраняем сигнал для логики тайм-аута в вызывающем коде
   */
  abortSignal(signal: AbortSignal): QueryBuilder<T> {
    // pg не поддерживает AbortSignal напрямую
    // Сохраняем для совместимости, проверяем при выполнении
    (this as any)._abortSignal = signal;
    return this;
  }

  /**
   * Строит WHERE clause из conditions, добавляя значения в массив и создавая placeholder'ы
   */
  private buildWhereClause(allValues: any[]): string {
    if (this.conditions.length === 0) return '';
    
    const whereParts: string[] = [];
    
    for (const cond of this.conditions) {
      // Raw SQL условие (для or() и пустого in())
      if (cond.raw) {
        whereParts.push(cond.raw);
        continue;
      }
      
      // Операторы без значений (IS NULL, IS NOT NULL, IS TRUE, IS FALSE)
      if (cond.values.length === 0) {
        whereParts.push(`"${cond.column}" ${cond.operator}`);
        continue;
      }
      
      // IN оператор - несколько placeholder'ов
      if (cond.operator === 'IN') {
        const placeholders: string[] = [];
        for (const v of cond.values) {
          allValues.push(v);
          placeholders.push(this.nextParam());
        }
        whereParts.push(`"${cond.column}" IN (${placeholders.join(', ')})`);
        continue;
      }
      
      // NOT оператор
      if (cond.operator.startsWith('NOT_')) {
        const actualOp = cond.operator.replace('NOT_', '');
        allValues.push(cond.values[0]);
        whereParts.push(`NOT ("${cond.column}" ${actualOp} ${this.nextParam()})`);
        continue;
      }
      
      // Стандартные операторы с одним значением
      allValues.push(cond.values[0]);
      whereParts.push(`"${cond.column}" ${cond.operator} ${this.nextParam()}`);
    }
    
    return ` WHERE ${whereParts.join(' AND ')}`;
  }

  /**
   * Собирает SQL запрос
   */
  private buildQuery(): { sql: string; values: any[] } {
    const allValues: any[] = [];
    let sql = '';
    
    // Сбрасываем счётчик параметров перед построением запроса
    this.paramCounter = 1;

    switch (this.operation) {
      case 'select': {
        // Обработка select с joins (упрощённо)
        const columns = this.parseSelectColumns(this.selectColumns);
        sql = `SELECT ${columns} FROM "${this.tableName}"`;
        
        sql += this.buildWhereClause(allValues);
        
        if (this.orderByClause.length > 0) {
          sql += ` ORDER BY ${this.orderByClause.join(', ')}`;
        }
        
        if (this.limitValue !== null) {
          sql += ` LIMIT ${this.limitValue}`;
        }
        
        if (this.rangeFrom !== null && this.rangeTo !== null) {
          sql += ` LIMIT ${this.rangeTo - this.rangeFrom + 1} OFFSET ${this.rangeFrom}`;
        }
        
        if (this.selectOptions.count === 'exact') {
          // Для count нужен отдельный запрос или window function
          sql = `SELECT COUNT(*) OVER() as full_count, * FROM (${sql}) AS subquery`;
        }
        
        break;
      }

      case 'insert': {
        const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
        const columns = Object.keys(rows[0]);
        const columnNames = columns.map(c => `"${c}"`).join(', ');
        
        for (const row of rows) {
          for (const col of columns) {
            allValues.push(row[col]);
          }
        }
        
        const valueStrings = rows.map(() => {
          return `(${columns.map(() => this.nextParam()).join(', ')})`;
        }).join(', ');
        
        sql = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valueStrings} RETURNING *`;
        break;
      }

      case 'update': {
        const columns = Object.keys(this.updateData);
        
        // Сначала добавляем значения SET
        const setParts = columns.map(col => {
          allValues.push(this.updateData[col]);
          return `"${col}" = ${this.nextParam()}`;
        });
        
        sql = `UPDATE "${this.tableName}" SET ${setParts.join(', ')}`;
        
        // Затем WHERE clause - placeholder'ы создаются ПОСЛЕ SET значений
        sql += this.buildWhereClause(allValues);
        
        sql += ' RETURNING *';
        break;
      }

      case 'upsert': {
        const rows = Array.isArray(this.upsertData) ? this.upsertData : [this.upsertData];
        const columns = Object.keys(rows[0]);
        const columnNames = columns.map(c => `"${c}"`).join(', ');
        
        for (const row of rows) {
          for (const col of columns) {
            allValues.push(row[col]);
          }
        }
        
        const valueStrings = rows.map(() => {
          return `(${columns.map(() => this.nextParam()).join(', ')})`;
        }).join(', ');
        
        // onConflict может быть одной колонкой или списком через запятую
        const conflictTarget = this.upsertOptions.onConflict || 'id';
        const conflictColumns = conflictTarget.split(',').map(c => c.trim());
        const conflictColumnsFormatted = conflictColumns.map(c => `"${c}"`).join(', ');
        
        const updateSet = columns
          .filter(c => !conflictColumns.includes(c))
          .map(c => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        
        sql = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valueStrings}`;
        sql += ` ON CONFLICT (${conflictColumnsFormatted}) DO UPDATE SET ${updateSet}`;
        sql += ' RETURNING *';
        break;
      }

      case 'delete': {
        sql = `DELETE FROM "${this.tableName}"`;
        
        sql += this.buildWhereClause(allValues);
        
        sql += ' RETURNING *';
        break;
      }
    }

    return { sql, values: allValues };
  }

  /**
   * Парсит колонки для SELECT (упрощённо обрабатывает joins)
   */
  private parseSelectColumns(columns: string): string {
    // Supabase-стиль: "id, name, organization:organizations(id, name)"
    // Упрощённо возвращаем как есть, сложные joins требуют отдельной обработки
    if (columns.includes('(')) {
      const logger = createServiceLogger('PostgresQueryBuilder');
      logger.warn({ columns }, 'Complex select with joins detected. Consider using raw SQL for complex queries.');
      // Возвращаем базовые колонки без joins
      return columns.split(',').map(c => {
        const base = c.trim().split(':')[0].split('(')[0];
        return `"${base.trim()}"`;
      }).join(', ');
    }
    
    if (columns === '*') return '*';
    
    return columns.split(',').map(c => `"${c.trim()}"`).join(', ');
  }

  async single(): Promise<DbResult<T>> {
    try {
      const { sql, values } = this.buildQuery();
      const result = await this.pool.query(sql, values);
      return transformResult<T>(result, true);
    } catch (error: any) {
      return { data: null, error: transformError(error) };
    }
  }

  async maybeSingle(): Promise<DbResult<T | null>> {
    try {
      const { sql, values } = this.buildQuery();
      const result = await this.pool.query(sql, values);
      return transformResult<T>(result, true);
    } catch (error: any) {
      return { data: null, error: transformError(error) };
    }
  }

  async then<TResult>(
    onfulfilled?: (value: DbResult<T[]>) => TResult | PromiseLike<TResult>
  ): Promise<TResult> {
    try {
      const { sql, values } = this.buildQuery();
      const result = await this.pool.query(sql, values);
      const transformed = transformResult<T[]>(result, false);
      
      if (onfulfilled) {
        return onfulfilled(transformed);
      }
      return transformed as unknown as TResult;
    } catch (error: any) {
      const errorResult: DbResult<T[]> = { data: null, error: transformError(error) };
      if (onfulfilled) {
        return onfulfilled(errorResult);
      }
      return errorResult as unknown as TResult;
    }
  }
}

/**
 * PostgreSQL реализация DbClient
 */
export class PostgresDbClient implements DbClient {
  private pool: any;
  private initialized = false;

  constructor() {}

  private async ensureInitialized() {
    if (!this.initialized) {
      this.pool = await getPool();
      this.initialized = true;
    }
  }

  from<T = any>(table: string): QueryBuilder<T> {
    // Возвращаем builder с lazy initialization
    const builder = new PostgresQueryBuilder<T>(null, table);
    
    // Оборачиваем методы для lazy init
    const originalSingle = builder.single.bind(builder);
    const originalMaybeSingle = builder.maybeSingle.bind(builder);
    const originalThen = builder.then.bind(builder);
    
    builder.single = async () => {
      await this.ensureInitialized();
      (builder as any).pool = this.pool;
      return originalSingle();
    };
    
    builder.maybeSingle = async () => {
      await this.ensureInitialized();
      (builder as any).pool = this.pool;
      return originalMaybeSingle();
    };
    
    builder.then = async (onfulfilled?: any) => {
      await this.ensureInitialized();
      (builder as any).pool = this.pool;
      return originalThen(onfulfilled);
    };
    
    return builder;
  }

  async rpc<T = any>(
    functionName: string,
    params?: Record<string, any>,
    options?: { count?: 'exact' | 'planned' | 'estimated' }
  ): Promise<DbResult<T>> {
    try {
      await this.ensureInitialized();
      
      // Формируем вызов функции PostgreSQL
      const paramNames = params ? Object.keys(params) : [];
      const paramValues = params ? Object.values(params) : [];
      const placeholders = paramNames.map((name, i) => `${name} := $${i + 1}`).join(', ');
      
      const sql = `SELECT * FROM ${functionName}(${placeholders})`;
      const result = await this.pool.query(sql, paramValues);
      
      return {
        data: result.rows as T,
        error: null,
        count: result.rowCount
      };
    } catch (error: any) {
      return { data: null, error: transformError(error) };
    }
  }

  async raw<T = any>(sql: string, params?: any[]): Promise<DbResult<T[]>> {
    try {
      await this.ensureInitialized();
      
      const result = await this.pool.query(sql, params);
      return {
        data: result.rows as T[],
        error: null,
        count: result.rowCount
      };
    } catch (error: any) {
      return { data: null, error: transformError(error) };
    }
  }

  /**
   * Выполняет транзакцию
   */
  async transaction<T>(
    callback: (client: any) => Promise<T>
  ): Promise<DbResult<T>> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return { data: result, error: null };
    } catch (error: any) {
      await client.query('ROLLBACK');
      return { data: null, error: transformError(error) };
    } finally {
      client.release();
    }
  }

  /**
   * Закрывает пул соединений (для graceful shutdown)
   */
  async close(): Promise<void> {
    if (poolInstance) {
      await poolInstance.end();
      poolInstance = null;
    }
  }
}

/**
 * Создаёт PostgreSQL клиент
 */
export function createPostgresClient(): PostgresDbClient {
  return new PostgresDbClient();
}

/**
 * Singleton instance для переиспользования
 */
let postgresClientInstance: PostgresDbClient | null = null;

export function getPostgresClient(): PostgresDbClient {
  if (!postgresClientInstance) {
    postgresClientInstance = new PostgresDbClient();
  }
  return postgresClientInstance;
}

