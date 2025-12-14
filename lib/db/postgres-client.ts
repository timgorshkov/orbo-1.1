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
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DATABASE_POOL_SIZE || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
    
    // Обработка ошибок пула
    poolInstance.on('error', (err: Error) => {
      console.error('[PostgreSQL Pool] Unexpected error:', err);
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
  private conditions: { sql: string; values: any[] }[] = [];
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

  // Фильтры
  eq(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" = ${this.nextParam()}`, values: [value] });
    return this;
  }

  neq(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" != ${this.nextParam()}`, values: [value] });
    return this;
  }

  gt(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" > ${this.nextParam()}`, values: [value] });
    return this;
  }

  gte(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" >= ${this.nextParam()}`, values: [value] });
    return this;
  }

  lt(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" < ${this.nextParam()}`, values: [value] });
    return this;
  }

  lte(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" <= ${this.nextParam()}`, values: [value] });
    return this;
  }

  like(column: string, pattern: string): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" LIKE ${this.nextParam()}`, values: [pattern] });
    return this;
  }

  ilike(column: string, pattern: string): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" ILIKE ${this.nextParam()}`, values: [pattern] });
    return this;
  }

  is(column: string, value: null | boolean): QueryBuilder<T> {
    if (value === null) {
      this.conditions.push({ sql: `"${column}" IS NULL`, values: [] });
    } else {
      this.conditions.push({ sql: `"${column}" IS ${value ? 'TRUE' : 'FALSE'}`, values: [] });
    }
    return this;
  }

  in(column: string, values: any[]): QueryBuilder<T> {
    if (values.length === 0) {
      // Пустой массив - условие никогда не выполняется
      this.conditions.push({ sql: '1 = 0', values: [] });
    } else {
      const placeholders = values.map(() => this.nextParam()).join(', ');
      this.conditions.push({ sql: `"${column}" IN (${placeholders})`, values });
    }
    return this;
  }

  contains(column: string, value: any): QueryBuilder<T> {
    // Для JSONB массивов
    this.conditions.push({ sql: `"${column}" @> ${this.nextParam()}`, values: [JSON.stringify(value)] });
    return this;
  }

  containedBy(column: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" <@ ${this.nextParam()}`, values: [JSON.stringify(value)] });
    return this;
  }

  not(column: string, operator: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `NOT ("${column}" ${operator} ${this.nextParam()})`, values: [value] });
    return this;
  }

  or(filters: string): QueryBuilder<T> {
    // Упрощённая реализация - парсинг Supabase-стиля фильтров
    // Пример: "status.eq.active,status.eq.pending"
    console.warn('or() filter requires manual SQL conversion for complex cases');
    this.conditions.push({ sql: `(${filters.replace(/\./g, ' ')})`, values: [] });
    return this;
  }

  filter(column: string, operator: string, value: any): QueryBuilder<T> {
    this.conditions.push({ sql: `"${column}" ${operator} ${this.nextParam()}`, values: [value] });
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
   * Собирает SQL запрос
   */
  private buildQuery(): { sql: string; values: any[] } {
    const allValues: any[] = [];
    let sql = '';

    switch (this.operation) {
      case 'select': {
        // Обработка select с joins (упрощённо)
        const columns = this.parseSelectColumns(this.selectColumns);
        sql = `SELECT ${columns} FROM "${this.tableName}"`;
        
        if (this.conditions.length > 0) {
          const whereParts: string[] = [];
          for (const cond of this.conditions) {
            whereParts.push(cond.sql);
            allValues.push(...cond.values);
          }
          sql += ` WHERE ${whereParts.join(' AND ')}`;
        }
        
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
        
        const valuePlaceholders = rows.map(row => {
          const placeholders = columns.map(() => {
            allValues.push(row[columns[allValues.length % columns.length]]);
            return this.nextParam();
          }).join(', ');
          return `(${placeholders})`;
        });
        
        // Пересобираем values правильно
        allValues.length = 0;
        for (const row of rows) {
          for (const col of columns) {
            allValues.push(row[col]);
          }
        }
        
        this.paramCounter = 1;
        const valueStrings = rows.map(row => {
          return `(${columns.map(() => this.nextParam()).join(', ')})`;
        }).join(', ');
        
        sql = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valueStrings} RETURNING *`;
        break;
      }

      case 'update': {
        const columns = Object.keys(this.updateData);
        const setParts = columns.map(col => {
          allValues.push(this.updateData[col]);
          return `"${col}" = ${this.nextParam()}`;
        });
        
        sql = `UPDATE "${this.tableName}" SET ${setParts.join(', ')}`;
        
        if (this.conditions.length > 0) {
          const whereParts: string[] = [];
          for (const cond of this.conditions) {
            whereParts.push(cond.sql);
            allValues.push(...cond.values);
          }
          sql += ` WHERE ${whereParts.join(' AND ')}`;
        }
        
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
        
        const valueStrings = rows.map(row => {
          return `(${columns.map(() => this.nextParam()).join(', ')})`;
        }).join(', ');
        
        const conflictTarget = this.upsertOptions.onConflict || 'id';
        const updateSet = columns
          .filter(c => c !== conflictTarget)
          .map(c => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        
        sql = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valueStrings}`;
        sql += ` ON CONFLICT ("${conflictTarget}") DO UPDATE SET ${updateSet}`;
        sql += ' RETURNING *';
        break;
      }

      case 'delete': {
        sql = `DELETE FROM "${this.tableName}"`;
        
        if (this.conditions.length > 0) {
          const whereParts: string[] = [];
          for (const cond of this.conditions) {
            whereParts.push(cond.sql);
            allValues.push(...cond.values);
          }
          sql += ` WHERE ${whereParts.join(' AND ')}`;
        }
        
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
      console.warn('Complex select with joins detected. Consider using raw SQL for complex queries.');
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

