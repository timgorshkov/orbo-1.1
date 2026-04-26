import { NextResponse } from 'next/server';
import { TelegramService } from '@/lib/services/telegramService';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/notifications/send-verification' });
  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { telegramUserId, verificationCode, orgId, userId } = body;

    if (!telegramUserId || !verificationCode) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    logger.info({ telegram_user_id: telegramUserId, org_id: orgId, user_id: userId }, 'Sending verification code');

    // Инициализируем бота уведомлений
    const notificationsBot = new TelegramService('notifications');

    const message = `🔐 *Код верификации Orbo*

Для подтверждения связи вашего Telegram аккаунта с организацией используйте код:

\`${verificationCode}\`

Введите этот код в веб-интерфейсе Orbo.

⏰ Код действителен 15 минут
🔒 Если вы не запрашивали этот код, проигнорируйте сообщение`;

    try {
      const result = await notificationsBot.sendMessage(telegramUserId, message, {
        parse_mode: 'Markdown'
      });

      if (result.ok) {
        return NextResponse.json({ 
          success: true,
          message: 'Verification code sent successfully'
        });
      } else {
        logger.error({ telegram_user_id: telegramUserId, result }, 'Failed to send verification code');
        return NextResponse.json({ 
          error: 'Failed to send verification code',
          details: result
        }, { status: 500 });
      }
    } catch (telegramError: any) {
      logger.error({ 
        telegram_user_id: telegramUserId,
        error: telegramError.message || String(telegramError),
        stack: telegramError.stack
      }, 'Telegram API error');
      
      // Если пользователь не начал диалог с ботом
      if (telegramError.message?.includes('chat not found') || 
          telegramError.message?.includes('bot was blocked')) {
        return NextResponse.json({ 
          error: 'Please start a conversation with @orbo_assistant_bot first',
          code: 'BOT_BLOCKED'
        }, { status: 400 });
      }

      return NextResponse.json({ 
        error: 'Failed to send verification code via Telegram',
      }, { status: 500 });
    }

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in send-verification');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
