import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

/**
 * API для миграции chat_id когда Telegram группа становится supergroup
 * POST /api/telegram/groups/migrate-chat
 * Body: { oldChatId: number, newChatId: number }
 */
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/groups/migrate-chat' });
  let oldChatId: number | undefined;
  let newChatId: number | undefined;
  try {
    const supabase = createAdminServer()
    
    const body = await req.json();
    oldChatId = body.oldChatId;
    newChatId = body.newChatId;
    
    if (!oldChatId || !newChatId) {
      return NextResponse.json(
        { error: 'oldChatId and newChatId are required' },
        { status: 400 }
      )
    }
    
    logger.info({ old_chat_id: oldChatId, new_chat_id: newChatId }, '[Chat Migration] Migrating');
    
    // Вызываем функцию миграции
    const { data: result, error } = await supabase
      .rpc('migrate_telegram_chat_id', {
        old_chat_id: oldChatId,
        new_chat_id: newChatId
      })
    
    if (error) {
      logger.error({ error: error.message, old_chat_id: oldChatId, new_chat_id: newChatId }, '[Chat Migration] Error');
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
    
    logger.info({ old_chat_id: oldChatId, new_chat_id: newChatId, result }, '[Chat Migration] Success');
    
    return NextResponse.json({
      success: true,
      result
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      old_chat_id: oldChatId || 'unknown',
      new_chat_id: newChatId || 'unknown'
    }, '[Chat Migration] Unexpected error');
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}



