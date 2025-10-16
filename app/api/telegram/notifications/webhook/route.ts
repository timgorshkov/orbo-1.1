import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  console.log('[Notifications Bot Webhook] ==================== WEBHOOK RECEIVED ====================');
  
  // Проверяем секретный токен
  const secret = process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET
  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token')
  const usingDedicatedSecret = !!process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET
  
  console.log('[Notifications Bot Webhook] Secret token check:', {
    endpoint: '/api/telegram/notifications/webhook',
    botType: 'NOTIFICATIONS',
    usingDedicatedSecret,
    secretSource: usingDedicatedSecret ? 'TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET' : 'TELEGRAM_WEBHOOK_SECRET (fallback)',
    hasSecret: !!secret,
    receivedMatches: receivedSecret === secret,
    secretLength: secret?.length,
    receivedSecretLength: receivedSecret?.length
  });
  
  if (receivedSecret !== secret) {
    console.error('[Notifications Bot Webhook] ❌ Unauthorized - secret token mismatch');
    console.error('[Notifications Bot Webhook] Endpoint: /api/telegram/notifications/webhook (NOTIFICATIONS BOT)');
    console.error('[Notifications Bot Webhook] Using dedicated secret:', usingDedicatedSecret);
    console.error('[Notifications Bot Webhook] Secret source:', usingDedicatedSecret ? 'TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET' : 'TELEGRAM_WEBHOOK_SECRET');
    console.error('[Notifications Bot Webhook] Expected secret length:', secret?.length);
    console.error('[Notifications Bot Webhook] Received secret length:', receivedSecret?.length);
    console.error('[Notifications Bot Webhook] To fix: Reset webhook using /api/telegram/admin/reset-webhook with botType=notifications');
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const body = await req.json()
    const supabase = await createClientServer()
    
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
        .limit(1)
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
            try {
              const telegramService = createTelegramService('notifications')
              console.log(`Sending welcome message to user ID: ${userId}`)
              
              const result = await telegramService.sendMessage(userId, 
                `🤖 *Orbo Assistant Bot*

Добро пожаловать! Этот бот используется для:
• Отправки уведомлений от системы Orbo
• Верификации вашего Telegram аккаунта

Доступные команды:
/help - показать помощь
/stop - отключить уведомления

Для получения уведомлений о событиях в ваших организациях, убедитесь что уведомления включены в веб-интерфейсе Orbo.

🔐 Если вы ожидаете код верификации, он будет отправлен автоматически после настройки аккаунта в веб-интерфейсе.`, {
                parse_mode: 'Markdown'
              })
              
              console.log('Welcome message result:', result)
              
              // Проверяем, есть ли ожидающие коды верификации для этого пользователя
              const { data: pendingVerifications } = await supabase
                .from('user_telegram_accounts')
                .select('*')
                .eq('telegram_user_id', userId)
                .eq('is_verified', false)
                .not('verification_code', 'is', null)
                .gt('verification_expires_at', new Date().toISOString())
                
              console.log('Found pending verifications:', pendingVerifications?.length || 0)
              
              // Если есть ожидающие коды, отправляем их
              if (pendingVerifications && pendingVerifications.length > 0) {
                for (const verification of pendingVerifications) {
                  console.log(`Resending verification code for account ID: ${verification.id}`)
                  
                  const message = `🔐 *Код верификации Orbo*

Для подтверждения связи вашего Telegram аккаунта с организацией используйте код:

\`${verification.verification_code}\`

Введите этот код в веб-интерфейсе Orbo.

⏰ Код действителен до ${new Date(verification.verification_expires_at).toLocaleString('ru')}
🔒 Если вы не запрашивали этот код, проигнорируйте сообщение`
                  
                  await telegramService.sendMessage(userId, message, {
                    parse_mode: 'Markdown'
                  })
                }
              }
            } catch (error) {
              console.error('Error sending welcome message:', error)
            }
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
