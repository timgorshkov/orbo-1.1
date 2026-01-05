/**
 * Test endpoint for PostgreSQL connection
 * 
 * GET /api/debug/postgres-test?secret=CRON_SECRET
 * 
 * Tests the direct PostgreSQL connection to verify migration worked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('PostgresTest');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for pg

// Direct pg Pool creation to avoid any abstraction issues
let Pool: any = null;
let poolInstance: any = null;

async function getDirectPool() {
  if (!Pool) {
    const pg = await import('pg');
    Pool = pg.Pool;
  }
  
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL_POSTGRES || process.env.DATABASE_URL;
    poolInstance = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  
  return poolInstance;
}

export async function GET(request: NextRequest) {
  // Проверка авторизации
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, any> = {};

  try {
    const pool = await getDirectPool();

    // Тест 1: Простой запрос версии
    const versionResult = await pool.query('SELECT version()');
    results.version = versionResult.rows[0]?.version;

    // Тест 2: Подсчёт таблиц
    const tableResult = await pool.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    results.tableCount = parseInt(tableResult.rows[0]?.count, 10);

    // Тест 3: Подсчёт организаций
    const orgResult = await pool.query('SELECT COUNT(*) as count FROM organizations');
    results.organizationsCount = parseInt(orgResult.rows[0]?.count, 10);

    // Тест 4: Подсчёт участников
    const partResult = await pool.query('SELECT COUNT(*) as count FROM participants');
    results.participantsCount = parseInt(partResult.rows[0]?.count, 10);

    // Тест 5: Подсчёт activity_events
    const eventsResult = await pool.query('SELECT COUNT(*) as count FROM activity_events');
    results.activityEventsCount = parseInt(eventsResult.rows[0]?.count, 10);

    // Тест 6: Вызов RPC функции
    const rpcResult = await pool.query('SELECT generate_verification_code()');
    results.rpcTestCode = rpcResult.rows[0]?.generate_verification_code;

    // Тест 7: Проверка последних событий
    const recentEvents = await pool.query(
      'SELECT id, event_type, created_at FROM activity_events ORDER BY created_at DESC LIMIT 3'
    );
    results.recentEvents = recentEvents.rows;

    const duration = Date.now() - startTime;
    
    logger.info({
      duration_ms: duration,
      tableCount: results.tableCount,
      orgs: results.organizationsCount,
      participants: results.participantsCount,
      events: results.activityEventsCount,
      success: true
    }, 'PostgreSQL test completed successfully');

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      provider: 'postgres-direct',
      database: 'orbo_migration',
      connectionString: process.env.DATABASE_URL_POSTGRES ? 'from DATABASE_URL_POSTGRES' : 'from DATABASE_URL',
      results
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error({
      error: error.message,
      code: error.code,
      stack: error.stack,
      duration_ms: duration
    }, 'PostgreSQL test failed');

    return NextResponse.json({
      success: false,
      duration_ms: duration,
      error: error.message,
      code: error.code,
      stack: error.stack
    }, { status: 500 });
  }
}

