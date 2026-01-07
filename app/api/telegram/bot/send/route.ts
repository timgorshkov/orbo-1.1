import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/bot/send' });
  try {
    // Проверяем авторизацию через unified auth
    const user = await getUnifiedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const supabase = createAdminServer()
    
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
    
    logger.info({ org_id: orgId, chat_id: chatId, user_id: user.id }, 'Sending bot message');
    
    // Проверяем, что группа принадлежит организации через org_telegram_groups
    const { data: orgGroupLink } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .single()
    
    let group = null;
    let groupError = null;
    if (orgGroupLink) {
      const { data: groupData, error: gError } = await supabase
        .from('telegram_groups')
        .select('id, tg_chat_id')
        .eq('tg_chat_id', chatId)
        .single();
      group = groupData;
      groupError = gError;
    }
    
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
    
    logger.debug({ chat_id: chatId, message_id: result.result?.message_id }, 'Bot message sent');
    
    return NextResponse.json({ success: true, messageId: result.result?.message_id })
  } catch (error: unknown) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error sending Telegram message');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
