import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export async function POST(req: NextRequest) {
  try {
    const { orgId, chatId } = await req.json()
    
    if (!chatId || isNaN(chatId)) {
      return NextResponse.json({ error: 'Invalid chat ID' }, { status: 400 })
    }
    
    const supabase = createClientServer()
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
    console.error('Error adding group:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
