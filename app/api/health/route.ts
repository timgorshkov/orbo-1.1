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
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Health check failed');
    
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
