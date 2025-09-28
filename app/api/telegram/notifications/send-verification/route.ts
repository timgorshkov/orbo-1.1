import { NextResponse } from 'next/server';
import { TelegramService } from '@/lib/services/telegramService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { telegramUserId, verificationCode, orgId, userId } = body;

    if (!telegramUserId || !verificationCode) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

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
        console.error('Failed to send verification code:', result);
        return NextResponse.json({ 
          error: 'Failed to send verification code',
          details: result
        }, { status: 500 });
      }
    } catch (telegramError: any) {
      console.error('Telegram API error:', telegramError);
      
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
        details: telegramError.message
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in send-verification:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
