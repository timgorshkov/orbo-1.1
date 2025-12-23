import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
// Note: Removed 'edge' runtime for Docker standalone compatibility

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/health' });
  const startTime = Date.now()
  try {
    // Проверка подключения к Supabase
    const supabase = await createClientServer()
    const { data, error } = await supabase.from('organizations').select('count').limit(1)
    
    if (error) {
      throw error
    }
    
    const endTime = Date.now()
    const responseTime = endTime - startTime
    
    // Возвращаем статус системы
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime
    })
  } catch (error: unknown) {
    // Handle different error types (Error instance, Supabase error object, unknown)
    let errorMessage = 'Unknown error';
    let errorCode: string | undefined;
    let errorDetails: string | undefined;
    let errorStack: string | undefined;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
    } else if (error && typeof error === 'object') {
      // Supabase errors are plain objects with message, code, details
      const errObj = error as Record<string, unknown>;
      errorMessage = String(errObj.message || errObj.error || JSON.stringify(error));
      errorCode = errObj.code ? String(errObj.code) : undefined;
      errorDetails = errObj.details ? String(errObj.details) : undefined;
    } else if (error) {
      errorMessage = String(error);
    }
    
    logger.error({ 
      error: errorMessage,
      error_code: errorCode,
      error_details: errorDetails,
      stack: errorStack,
      response_time_ms: Date.now() - startTime
    }, 'Health check failed');
    
    return NextResponse.json({
      status: 'unhealthy',
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
