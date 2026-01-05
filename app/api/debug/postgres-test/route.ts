/**
 * Test endpoint for PostgreSQL connection
 * 
 * GET /api/debug/postgres-test?secret=CRON_SECRET
 * 
 * Tests the direct PostgreSQL connection to verify migration worked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceLogger } from '@/lib/logger';
import { getPostgresClient } from '@/lib/db/postgres-client';

const logger = createServiceLogger('PostgresTest');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for pg

export async function GET(request: NextRequest) {
  // Проверка авторизации
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, any> = {};

  try {
    const db = getPostgresClient();

    // Тест 1: Простой запрос
    const { data: versionData, error: versionError } = await db.raw<{ version: string }>(
      'SELECT version()'
    );
    results.version = versionError ? versionError.message : versionData?.[0]?.version;

    // Тест 2: Подсчёт таблиц
    const { data: tableCount, error: tableError } = await db.raw<{ count: number }>(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    results.tableCount = tableError ? tableError.message : tableCount?.[0]?.count;

    // Тест 3: Выборка из основных таблиц
    const { data: orgCount, error: orgError } = await db
      .from('organizations')
      .select('*', { count: 'exact' })
      .limit(1);
    results.organizations = orgError ? orgError.message : { count: orgCount?.length || 0 };

    const { data: participantCount, error: partError } = await db
      .from('participants')
      .select('*', { count: 'exact' })
      .limit(1);
    results.participants = partError ? partError.message : { count: participantCount?.length || 0 };

    // Тест 4: Вызов RPC функции
    const { data: rpcData, error: rpcError } = await db.rpc('generate_verification_code');
    results.rpcTest = rpcError ? rpcError.message : { code: rpcData?.[0]?.generate_verification_code };

    // Тест 5: Проверка activity_events
    const { data: eventsData, error: eventsError } = await db
      .from('activity_events')
      .select('id, event_type, created_at')
      .order('created_at', { ascending: false })
      .limit(3);
    results.recentEvents = eventsError ? eventsError.message : eventsData;

    const duration = Date.now() - startTime;
    
    logger.info({
      duration_ms: duration,
      tableCount: results.tableCount,
      success: true
    }, 'PostgreSQL test completed');

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      provider: 'postgres',
      database: process.env.DATABASE_URL_POSTGRES ? 'orbo_migration' : 'from DATABASE_URL',
      results
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error({
      error: error.message,
      stack: error.stack,
      duration_ms: duration
    }, 'PostgreSQL test failed');

    return NextResponse.json({
      success: false,
      duration_ms: duration,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

