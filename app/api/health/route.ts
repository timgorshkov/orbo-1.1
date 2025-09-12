import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function GET() {
  const startTime = Date.now()
  try {
    // Проверка подключения к Supabase
    const supabase = createClientServer()
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
    console.error('Health check failed:', error)
    
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
