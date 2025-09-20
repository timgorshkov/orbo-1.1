import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Проверяем секретный токен
  const secret = process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const body = await req.json()
    const supabase = createClientServer()
    
    // Обрабатываем только сообщения от пользователей к боту
    if (body?.message && body.message.chat?.type === 'private') {
      const message = body.message
      const userId = message.from.id
      const text = message.text || ''
      
      // Проверяем, есть ли пользователь в базе
      const { data: participant } = await supabase
        .from('participants')
        .select('id, org_id')
        .eq('tg_user_id', userId)
        .single()
      
      if (!participant) {
        // Пользователь не найден в базе, отправляем сообщение об ошибке
        const telegramService = createTelegramService('notifications')
        await telegramService.sendMessage(userId, 
          'Вы не зарегистрированы в системе. Пожалуйста, сначала подключитесь к группе с основным ботом.'
        )
        return NextResponse.json({ ok: true })
      }
      
      // Обрабатываем команды
      if (text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase()
        
        switch (command) {
          case '/start':
            // Включаем уведомления для пользователя
            await supabase
              .from('profiles')
              .update({ telegram_notifications_enabled: true })
              .eq('id', participant.id)
            
            // Отправляем приветственное сообщение
            const telegramService = createTelegramService('notifications')
            await telegramService.sendMessage(userId, 
              'Уведомления включены! Теперь вы будете получать важные обновления о событиях и активности в ваших группах.'
            )
            break
            
          case '/stop':
            // Отключаем уведомления для пользователя
            await supabase
              .from('profiles')
              .update({ telegram_notifications_enabled: false })
              .eq('id', participant.id)
            
            // Отправляем сообщение о выключении уведомлений
            const telegramService2 = createTelegramService('notifications')
            await telegramService2.sendMessage(userId, 
              'Уведомления отключены. Вы можете включить их снова командой /start.'
            )
            break
            
          case '/help':
            // Отправляем справку
            const telegramService3 = createTelegramService('notifications')
            await telegramService3.sendMessage(userId, 
              '<b>Доступные команды:</b>\n' +
              '/start - включить уведомления\n' +
              '/stop - отключить уведомления\n' +
              '/help - показать эту справку'
            )
            break
        }
      }
      
      // Записываем событие взаимодействия с ботом уведомлений
      await supabase.from('activity_events').insert({
        org_id: participant.org_id,
        event_type: 'service',
        tg_user_id: userId,
        tg_chat_id: message.chat.id,
        meta: {
          service_type: 'notification_bot',
          text: text.substring(0, 100) // Сохраняем только начало сообщения
        }
      })
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Notifications webhook error:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
