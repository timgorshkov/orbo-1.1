import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabaseClient'

export async function POST(req: NextRequest) {
  // Проверяем секретный токен
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET!
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const body = await req.json()
  // минимальная обработка: join/leave + message → activity_events
  const supabase = createClientServer()

  try {
    if (body?.my_chat_member) {
      // Бот добавлен/изменены права — можно отметить bot_status
      const update = body.my_chat_member
      const chatId = update.chat.id
      const status = update.new_chat_member.status
      
      // Проверяем, существует ли группа в базе
      const { data: group } = await supabase
        .from('telegram_groups')
        .select('id, org_id')
        .eq('tg_chat_id', chatId)
        .single()
      
      if (group) {
        // Обновляем статус бота
        await supabase
          .from('telegram_groups')
          .update({
            bot_status: status === 'administrator' ? 'connected' : 'pending',
            last_sync_at: status === 'administrator' ? new Date().toISOString() : null
          })
          .eq('id', group.id)
      }
    }
    
    if (body?.chat_member) {
      // Участник присоединился/вышел
      const update = body.chat_member
      const chatId = update.chat.id
      const userId = update.new_chat_member.user.id
      const status = update.new_chat_member.status
      const isJoin = status === 'member' || status === 'administrator'
      const isLeave = status === 'left' || status === 'kicked'
      
      // Находим организацию по чату
      const { data: group } = await supabase
        .from('telegram_groups')
        .select('org_id')
        .eq('tg_chat_id', chatId)
        .single()
      
      if (group?.org_id) {
        const orgId = group.org_id
        
        // Участник
        const user = update.new_chat_member.user
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
        
        // Добавляем или обновляем участника
        const { data: participant } = await supabase
          .from('participants')
          .upsert({
            org_id: orgId,
            tg_user_id: userId,
            username: user.username || null,
            full_name: fullName || `User${userId}`,
          })
          .select('id')
          .single()
        
        if (participant?.id) {
          // Обновляем связь участник-группа
          if (isJoin) {
            await supabase
              .from('participant_groups')
              .upsert({
                participant_id: participant.id,
                tg_group_id: chatId,
                joined_at: new Date().toISOString(),
                left_at: null
              })
            
            // Записываем событие присоединения
            await supabase.from('activity_events').insert({
              org_id: orgId,
              type: 'join',
              participant_id: participant.id,
              tg_group_id: chatId,
              meta: { user_id: userId }
            })
          } else if (isLeave) {
            // Обновляем дату выхода
            await supabase
              .from('participant_groups')
              .update({ left_at: new Date().toISOString() })
              .match({ participant_id: participant.id, tg_group_id: chatId })
            
            // Записываем событие выхода
            await supabase.from('activity_events').insert({
              org_id: orgId,
              type: 'leave',
              participant_id: participant.id,
              tg_group_id: chatId,
              meta: { user_id: userId }
            })
          }
        }
      }
    }
    
    if (body?.message) {
      const msg = body.message
      const chatId = msg.chat?.id
      const from = msg.from
      // Обрабатываем сообщения
      if (from && chatId) {
        const { data: orgRow } = await supabase
          .from('telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', chatId)
          .single()

        if (orgRow?.org_id) {
          const { data: p } = await supabase
            .from('participants')
            .upsert({
              org_id: orgRow.org_id,
              tg_user_id: from.id,
              username: from.username ?? null,
              full_name: [from.first_name, from.last_name].filter(Boolean).join(' ')
            }, { onConflict: 'org_id,tg_user_id' })
            .select('id').single()

          // Записываем событие сообщения
          await supabase.from('activity_events').insert({
            org_id: orgRow.org_id,
            type: 'message',
            participant_id: p?.id,
            tg_group_id: chatId,
            meta: { message_id: msg.message_id }
          })
        }
      }
    }
  } catch (e) {
    console.error('tg webhook error', e)
  }
  
  return NextResponse.json({ ok: true })
}
