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
      const firstName = message.from.first_name || 'пользователь'
      
      // Обрабатываем команды
      if (text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase()
        const telegramService = createTelegramService('notifications')
        
        switch (command) {
          case '/start':
            // Отправляем приветственное сообщение с User ID
            try {
              console.log(`Sending welcome message with User ID to: ${userId}`)
              
              const welcomeMessage = `👋 Привет, ${firstName}!

🤖 *Orbo Assistant Bot*

Ваш Telegram User ID: \`${userId}\`

📋 *Следующие шаги:*
1. Скопируйте ваш User ID выше (нажмите на него)
2. Перейдите в веб-интерфейс Orbo
3. Откройте "Настройка Telegram аккаунта"
4. Вставьте ваш User ID
5. Нажмите "Сохранить и отправить код верификации"
6. Вы получите код верификации здесь, в этом чате
7. Введите код в веб-интерфейсе

🔐 Этот бот используется для:
• Верификации вашего Telegram аккаунта
• Отправки кодов подтверждения
• Уведомлений о событиях в ваших организациях

_Если вам нужна помощь, используйте команду /help_`
              
              const result = await telegramService.sendMessage(userId, welcomeMessage, {
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
            
          case '/help':
            // Отправляем справку с User ID
            try {
              const helpMessage = `🤖 *Orbo Assistant Bot - Помощь*

Ваш Telegram User ID: \`${userId}\`

*Доступные команды:*
• /start - получить ваш User ID и инструкции
• /help - показать эту справку

*Как подключить Telegram аккаунт:*
1. Скопируйте ваш User ID выше
2. Откройте веб-интерфейс Orbo
3. Перейдите в "Настройка Telegram аккаунта"
4. Введите ваш User ID и сохраните
5. Получите код верификации в этом чате
6. Введите код в веб-интерфейсе

*Проблемы?*
• Не приходит код? Убедитесь, что вы сначала запустили бота командой /start
• Код не работает? Коды действуют 15 минут, запросите новый код в веб-интерфейсе

💡 После подключения вы будете получать уведомления о событиях в ваших организациях.`
              
              await telegramService.sendMessage(userId, helpMessage, {
                parse_mode: 'Markdown'
              })
            } catch (error) {
              console.error('Error sending help message:', error)
            }
            break
        }
      }
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Notifications webhook error:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
