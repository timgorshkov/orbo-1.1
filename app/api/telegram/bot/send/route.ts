import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Проверяем авторизацию
    const supabase = createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Получаем данные из запроса
    const { orgId, chatId, message, options } = await req.json()
    
    if (!orgId || !chatId || !message) {
      return NextResponse.json({ 
        error: 'Organization ID, Chat ID and message are required' 
      }, { status: 400 })
    }
    
    // Проверяем, что пользователь имеет доступ к организации
    const { data: membership, error: memberError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()
    
    if (memberError || !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Проверяем, что группа принадлежит организации
    const { data: group, error: groupError } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .single()
    
    if (groupError || !group) {
      return NextResponse.json({ 
        error: 'Telegram group not found or not associated with this organization' 
      }, { status: 404 })
    }
    
    // Отправляем сообщение
    const telegramService = createTelegramService()
    const result = await telegramService.sendMessage(chatId, message, options || {})
    
    // Записываем событие отправки сообщения
    await supabase.from('activity_events').insert({
      org_id: orgId,
      type: 'bot_message',
      tg_group_id: chatId,
      meta: { 
        message_id: result.result?.message_id,
        sent_by_user: user.id
      }
    })
    
    return NextResponse.json({ success: true, messageId: result.result?.message_id })
  } catch (error: unknown) {
    console.error('Error sending Telegram message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
