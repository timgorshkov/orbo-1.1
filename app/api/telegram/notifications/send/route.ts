import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { org_id, user_ids, message, notification_type } = await req.json()
    
    if (!org_id || !message || !notification_type) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }
    
    const supabase = createClientServer()
    
    // Получаем токен бота уведомлений для организации
    const { data: botData } = await supabase
      .from('telegram_bots')
      .select('token')
      .eq('org_id', org_id)
      .eq('bot_type', 'notifications')
      .eq('is_active', true)
      .single()
    
    if (!botData?.token) {
      return NextResponse.json({ success: false, error: 'Notification bot not configured' }, { status: 404 })
    }
    
    // Создаем сервис для бота уведомлений
    const telegramService = createTelegramService('notifications')
    
    // Если указаны конкретные пользователи
    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
      // Получаем Telegram ID пользователей
      const { data: participants } = await supabase
        .from('participants')
        .select('tg_user_id')
        .eq('org_id', org_id)
        .in('id', user_ids)
        .eq('telegram_notifications_enabled', true)
      
      if (!participants || participants.length === 0) {
        return NextResponse.json({ success: false, error: 'No eligible participants found' }, { status: 404 })
      }
      
      // Отправляем сообщение каждому пользователю
      const results = await Promise.allSettled(
        participants.map(async (participant) => {
          try {
            await telegramService.sendMessage(participant.tg_user_id, message)
            return { userId: participant.tg_user_id, success: true }
          } catch (error) {
            console.error(`Error sending notification to ${participant.tg_user_id}:`, error)
            return { userId: participant.tg_user_id, success: false, error }
          }
        })
      )
      
      // Записываем события отправки уведомлений
      await Promise.all(
        participants.map(async (participant) => {
          await supabase.from('activity_events').insert({
            org_id,
            event_type: 'service',
            tg_user_id: participant.tg_user_id,
            meta: {
              service_type: 'notification_sent',
              notification_type,
              success: true
            }
          })
        })
      )
      
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length
      
      return NextResponse.json({ 
        success: true, 
        sent: successCount,
        total: participants.length
      })
    } else {
      // Отправляем всем пользователям организации с включенными уведомлениями
      const { data: participants } = await supabase
        .from('participants')
        .select('tg_user_id')
        .eq('org_id', org_id)
        .eq('telegram_notifications_enabled', true)
      
      if (!participants || participants.length === 0) {
        return NextResponse.json({ success: false, error: 'No eligible participants found' }, { status: 404 })
      }
      
      // Отправляем сообщение каждому пользователю
      const results = await Promise.allSettled(
        participants.map(async (participant) => {
          try {
            await telegramService.sendMessage(participant.tg_user_id, message)
            return { userId: participant.tg_user_id, success: true }
          } catch (error) {
            console.error(`Error sending notification to ${participant.tg_user_id}:`, error)
            return { userId: participant.tg_user_id, success: false, error }
          }
        })
      )
      
      // Записываем события отправки уведомлений
      await Promise.all(
        participants.map(async (participant) => {
          await supabase.from('activity_events').insert({
            org_id,
            event_type: 'service',
            tg_user_id: participant.tg_user_id,
            meta: {
              service_type: 'notification_sent',
              notification_type,
              success: true
            }
          })
        })
      )
      
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length
      
      return NextResponse.json({ 
        success: true, 
        sent: successCount,
        total: participants.length
      })
    }
  } catch (error) {
    console.error('Error sending notifications:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
