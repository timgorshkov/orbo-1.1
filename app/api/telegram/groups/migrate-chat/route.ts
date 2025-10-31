import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'

/**
 * API для миграции chat_id когда Telegram группа становится supergroup
 * POST /api/telegram/groups/migrate-chat
 * Body: { oldChatId: number, newChatId: number }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminServer()
    
    const { oldChatId, newChatId } = await req.json()
    
    if (!oldChatId || !newChatId) {
      return NextResponse.json(
        { error: 'oldChatId and newChatId are required' },
        { status: 400 }
      )
    }
    
    console.log(`[Chat Migration] Migrating from ${oldChatId} to ${newChatId}`)
    
    // Вызываем функцию миграции
    const { data: result, error } = await supabase
      .rpc('migrate_telegram_chat_id', {
        old_chat_id: oldChatId,
        new_chat_id: newChatId
      })
    
    if (error) {
      console.error('[Chat Migration] Error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    // Сохраняем результат миграции
    await supabase
      .from('telegram_chat_migrations')
      .insert({
        old_chat_id: oldChatId,
        new_chat_id: newChatId,
        migration_result: result
      })
    
    console.log('[Chat Migration] Success:', result)
    
    return NextResponse.json({
      success: true,
      result
    })
  } catch (error: any) {
    console.error('[Chat Migration] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}



