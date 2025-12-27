import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
// Note: Removed 'edge' runtime for Docker standalone compatibility

// Helper function to check DB with timeout
async function checkDatabase(timeoutMs: number = 5000): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  
  try {
    const supabase = await createClientServer();
    
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const { error } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal);
      
      clearTimeout(timeoutId);
      
      if (error) {
        return { ok: false, latency: Date.now() - start, error: error.message };
      }
      
      return { ok: true, latency: Date.now() - start };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      return { ok: false, latency: Date.now() - start, error: fetchError.message };
    }
  } catch (error: any) {
    return { ok: false, latency: Date.now() - start, error: error.message };
  }
}

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/health' });
  const startTime = Date.now();
  
  // Try DB check with retry (2 attempts, 3s timeout each)
  let dbResult = await checkDatabase(3000);
  
  if (!dbResult.ok) {
    // Retry once on failure (cold start recovery)
    dbResult = await checkDatabase(5000);
  }
  
  const totalTime = Date.now() - startTime;
  
  // App is always "alive" - DB status is separate
  if (dbResult.ok) {
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
      timestamp: new Date().toISOString(),
      response_time_ms: totalTime,
      db_latency_ms: dbResult.latency
    });
  }
  
  // DB is down but app is alive - return degraded status
  // Use warn level, not error, for transient DB issues
  const isTimeout = dbResult.error?.includes('timeout') || 
                    dbResult.error?.includes('Timeout') ||
                    dbResult.error?.includes('abort') ||
                    dbResult.error?.includes('fetch failed');
  
  if (isTimeout) {
    logger.warn({ 
      error: dbResult.error,
      db_latency_ms: dbResult.latency,
      response_time_ms: totalTime
    }, 'Health check: DB timeout (transient)');
  } else {
    logger.error({ 
      error: dbResult.error,
      db_latency_ms: dbResult.latency,
      response_time_ms: totalTime
    }, 'Health check: DB error');
  }
  
  // Return 200 with degraded status instead of 500
  // This prevents Docker/k8s from killing the container on transient DB issues
  return NextResponse.json({
    status: 'degraded',
    database: 'disconnected',
    database_error: dbResult.error,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    timestamp: new Date().toISOString(),
    response_time_ms: totalTime,
    db_latency_ms: dbResult.latency
  });
}
