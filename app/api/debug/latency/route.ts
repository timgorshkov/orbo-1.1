import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/latency
 * 
 * Test database latency from the server.
 * Useful for diagnosing performance issues.
 * 
 * Requires CRON_SECRET header for security.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/debug/latency' });
  
  // Simple auth check
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    db_provider: 'postgres',
    db_host: process.env.DB_HOST || 'postgres',
    tests: {}
  };
  
  const db = createAdminServer();
  
  // Test 1: Simple query
  try {
    const start = Date.now();
    await db.from('organizations').select('id').limit(1);
    results.tests.simple_query_ms = Date.now() - start;
  } catch (error) {
    results.tests.simple_query_error = error instanceof Error ? error.message : String(error);
  }
  
  // Test 2: RPC call
  try {
    const start = Date.now();
    await db.rpc('resolve_telegram_chat_id', { p_chat_id: '0' });
    results.tests.rpc_call_ms = Date.now() - start;
  } catch (error) {
    results.tests.rpc_call_error = error instanceof Error ? error.message : String(error);
  }
  
  // Test 3: Multiple parallel queries
  try {
    const start = Date.now();
    await Promise.all([
      db.from('organizations').select('id').limit(1),
      db.from('memberships').select('id').limit(1),
      db.from('participants').select('id').limit(1),
    ]);
    results.tests.parallel_3_queries_ms = Date.now() - start;
  } catch (error) {
    results.tests.parallel_queries_error = error instanceof Error ? error.message : String(error);
  }
  
  // Summary
  const queryTimes = [
    results.tests.simple_query_ms,
    results.tests.rpc_call_ms,
  ].filter(t => typeof t === 'number');
  
  if (queryTimes.length > 0) {
    results.summary = {
      avg_query_latency_ms: Math.round(queryTimes.reduce((a: number, b: number) => a + b, 0) / queryTimes.length),
      min_latency_ms: Math.min(...queryTimes),
      max_latency_ms: Math.max(...queryTimes),
      recommendation: queryTimes.every(t => t < 10) 
        ? 'Latency is excellent (<10ms, local PostgreSQL)' 
        : queryTimes.every(t => t < 50)
          ? 'Latency is good (<50ms)'
          : 'Latency is higher than expected for local PostgreSQL'
    };
  }
  
  logger.info(results, 'Latency test completed');
  
  return NextResponse.json(results);
}
