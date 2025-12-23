import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { webhookRecoveryService } from '@/lib/services/webhookRecoveryService'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { webhook: 'notifications' });
  logger.debug('Webhook received');
  
  // Проверяем секретный токен
  const secret = process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET
  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token')
  const usingDedicatedSecret = !!process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET
  
  logger.debug({ 
    endpoint: '/api/telegram/notifications/webhook',
    bot_type: 'NOTIFICATIONS',
    using_dedicated_secret: usingDedicatedSecret,
    secret_source: usingDedicatedSecret ? 'TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET' : 'TELEGRAM_WEBHOOK_SECRET (fallback)',
    has_secret: !!secret,
    received_matches: receivedSecret === secret,
    secret_length: secret?.length,
    received_secret_length: receivedSecret?.length
  }, 'Secret token check');
  
  if (receivedSecret !== secret) {
    logger.error({ 
      endpoint: '/api/telegram/notifications/webhook',
      bot_type: 'NOTIFICATIONS',
      using_dedicated_secret: usingDedicatedSecret,
      secret_source: usingDedicatedSecret ? 'TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET' : 'TELEGRAM_WEBHOOK_SECRET',
      expected_secret_length: secret?.length,
      received_secret_length: receivedSecret?.length
    }, 'Unauthorized - secret token mismatch');
    
    // 🔧 Автоматическое восстановление webhook
    logger.info({ bot_type: 'notifications' }, 'Attempting automatic webhook recovery');
    webhookRecoveryService.recoverWebhook('notifications', 'secret_token_mismatch').catch(err => {
      logger.error({ 
        error: err instanceof Error ? err.message : String(err)
      }, 'Recovery failed');
    });
    
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
              logger.debug({ user_id: userId }, 'Sending welcome message');
              
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
              
              logger.debug({ user_id: userId, result }, 'Welcome message sent');
              
              // Проверяем, есть ли ожидающие коды верификации для этого пользователя
              const { data: pendingVerifications } = await supabase
                .from('user_telegram_accounts')
                .select('*')
                .eq('telegram_user_id', userId)
                .eq('is_verified', false)
                .not('verification_code', 'is', null)
                .gt('verification_expires_at', new Date().toISOString())
                
              logger.debug({ 
                user_id: userId,
                pending_count: pendingVerifications?.length || 0
              }, 'Found pending verifications');
              
              // Если есть ожидающие коды, отправляем их
              if (pendingVerifications && pendingVerifications.length > 0) {
                for (const verification of pendingVerifications) {
                  logger.debug({ 
                    user_id: userId,
                    account_id: verification.id
                  }, 'Resending verification code');
                  
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
              logger.error({ 
                user_id: userId,
                error: error instanceof Error ? error.message : String(error)
              }, 'Error sending welcome message');
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
              logger.error({ 
                user_id: userId,
                error: error instanceof Error ? error.message : String(error)
              }, 'Error sending help message');
            }
            break
        }
      }
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Notifications webhook error');
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
