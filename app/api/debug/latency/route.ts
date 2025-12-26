import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/latency
 * 
 * Test network latency to Supabase from the server.
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
    server_region: process.env.VERCEL_REGION || process.env.RAILWAY_REGION || 'unknown',
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/https?:\/\//, '').split('.')[0] || 'unknown',
    tests: {}
  };
  
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  
  // Test 1: Simple ping (select 1)
  try {
    const start = Date.now();
    await supabaseAdmin.from('organizations').select('id').limit(1);
    results.tests.simple_query_ms = Date.now() - start;
  } catch (error) {
    results.tests.simple_query_error = error instanceof Error ? error.message : String(error);
  }
  
  // Test 2: Auth getUser (the slow operation)
  try {
    const start = Date.now();
    // Use a dummy token to test auth endpoint response time
    await supabaseAdmin.auth.getUser('dummy-token-for-latency-test');
    results.tests.auth_getUser_ms = Date.now() - start;
  } catch (error) {
    results.tests.auth_getUser_ms = Date.now() - (results.tests.simple_query_ms ? Date.now() - results.tests.simple_query_ms : 0);
    // Auth will fail but we still get timing
  }
  
  // Test 3: RPC call (like migration_resolve)
  try {
    const start = Date.now();
    await supabaseAdmin.rpc('resolve_telegram_chat_id', { p_chat_id: '0' });
    results.tests.rpc_call_ms = Date.now() - start;
  } catch (error) {
    results.tests.rpc_call_error = error instanceof Error ? error.message : String(error);
  }
  
  // Test 4: Multiple parallel queries
  try {
    const start = Date.now();
    await Promise.all([
      supabaseAdmin.from('organizations').select('id').limit(1),
      supabaseAdmin.from('memberships').select('id').limit(1),
      supabaseAdmin.from('participants').select('id').limit(1),
    ]);
    results.tests.parallel_3_queries_ms = Date.now() - start;
  } catch (error) {
    results.tests.parallel_queries_error = error instanceof Error ? error.message : String(error);
  }
  
  // Test 5: DNS resolution time (approximate via fetch)
  try {
    const start = Date.now();
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      }
    });
    results.tests.http_head_ms = Date.now() - start;
    results.tests.http_status = response.status;
  } catch (error) {
    results.tests.http_error = error instanceof Error ? error.message : String(error);
  }
  
  // Summary
  const queryTimes = [
    results.tests.simple_query_ms,
    results.tests.rpc_call_ms,
  ].filter(t => typeof t === 'number');
  
  if (queryTimes.length > 0) {
    results.summary = {
      avg_query_latency_ms: Math.round(queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length),
      min_latency_ms: Math.min(...queryTimes),
      max_latency_ms: Math.max(...queryTimes),
      recommendation: queryTimes.every(t => t < 200) 
        ? 'Latency is good (<200ms)' 
        : queryTimes.every(t => t < 500)
          ? 'Latency is acceptable (200-500ms)'
          : 'Latency is high (>500ms) - consider edge deployment or connection pooling'
    };
  }
  
  logger.info(results, 'Latency test completed');
  
  return NextResponse.json(results);
}

