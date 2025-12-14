import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 минут для Vercel cron

// Этот маршрут будет вызываться через Vercel Cron
export async function GET(req: NextRequest) {
  try {
    // Проверяем авторизацию (защита от публичного доступа)
    // В продакшене для большей безопасности можно использовать JWT токен или другой метод
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClientServer()
    const startTime = Date.now()
    const results = {
      processed: 0,
      updated: 0,
      errors: 0,
      details: [] as string[]
    }
    
    // Получаем список групп для синхронизации
    const { data: groups, error: groupsError } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('bot_status', 'connected')
      .order('id')
    
    if (groupsError) {
      throw new Error(`Error fetching groups: ${groupsError.message}`)
    }
    
    // Обрабатываем каждую группу
    for (const group of groups || []) {
      try {
        // В полной реализации здесь будет логика синхронизации с Telegram API
        // Для MVP просто обновляем last_sync_at
        const { error: updateError } = await supabase
          .from('telegram_groups')
          .update({
            last_sync_at: new Date().toISOString()
          })
          .eq('id', group.id)
        
        if (updateError) {
          results.errors++
          results.details.push(`Error updating group ${group.id}: ${updateError.message}`)
        } else {
          results.updated++
        }
        
        results.processed++
      } catch (error) {
        results.errors++
        results.details.push(`Error processing group ${group.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    
    // Записываем результат в лог
    console.log(`Sync completed in ${Date.now() - startTime}ms`, results)
    
    return NextResponse.json({
      success: true,
      execution_time_ms: Date.now() - startTime,
      stats: results
    })
    
  } catch (error) {
    console.error('Sync error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
