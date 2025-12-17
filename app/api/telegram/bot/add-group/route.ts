import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/bot/add-group' });
  try {
    const { orgId, chatId } = await req.json()
    
    if (!chatId || isNaN(chatId)) {
      return NextResponse.json({ error: 'Invalid chat ID' }, { status: 400 })
    }
    
    logger.info({ org_id: orgId, chat_id: chatId }, 'Adding group');
    
    const supabase = await createClientServer()
    const telegramService = createTelegramService()
    
    // Проверяем доступ к группе
    const chatInfo = await telegramService.getChat(chatId)
    if (!chatInfo?.result) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    
    // Добавляем группу в базу данных
    await supabase
      .from('telegram_groups')
      .insert({
        org_id: orgId,
        tg_chat_id: chatId,
        title: chatInfo.result.title || `Group ${chatId}`,
        bot_status: 'pending',
        last_sync_at: new Date().toISOString()
      })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error adding group');
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
