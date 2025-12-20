import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getEventBotToken, extractEventId } from '@/lib/telegram/webAppAuth';

/**
 * POST /api/telegram/event-bot/webhook
 * Webhook for @orbo_event_bot
 * Handles /start command to show event MiniApp
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/event-bot/webhook' });
  
  try {
    const update = await request.json();
    
    // Handle /start command with deep link
    if (update.message?.text?.startsWith('/start')) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const startParam = text.split(' ')[1]; // /start e-{eventId}
      
      const eventId = extractEventId(startParam);
      
      const botToken = getEventBotToken();
      if (!botToken) {
        logger.error({}, 'TELEGRAM_EVENT_BOT_TOKEN not configured');
        return NextResponse.json({ ok: true });
      }
      
      if (eventId) {
        // User clicked deep link - show event MiniApp
        const adminSupabase = createAdminServer();
        
        // Get event details
        const { data: event } = await adminSupabase
          .from('events')
          .select('title, event_date, cover_image_url, status')
          .eq('id', eventId)
          .single();
        
        if (event && event.status === 'published') {
          // Format event date
          const eventDate = new Date(event.event_date).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
          });
          
          const botUsername = process.env.TELEGRAM_EVENT_BOT_USERNAME || 'orbo_event_bot';
          const webAppUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://my.orbo.ru'}/tg-app/events/${eventId}`;
          
          // Send message with inline keyboard to open MiniApp
          const message = `📅 *${event.title}*\n\n🗓 ${eventDate}\n\nНажмите кнопку ниже для регистрации:`;
          
          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '✅ Зарегистрироваться',
                  web_app: { url: webAppUrl },
                },
              ],
            ],
          };
          
          await sendTelegramMessage(botToken, chatId, message, keyboard);
        } else {
          // Event not found or not published
          await sendTelegramMessage(
            botToken,
            chatId,
            '❌ Событие не найдено или недоступно для регистрации.'
          );
        }
      } else {
        // Just /start without event - show welcome message
        await sendTelegramMessage(
          botToken,
          chatId,
          `👋 Привет!\n\nЯ бот для регистрации на события через Orbo.\n\nПерейдите по ссылке события, чтобы зарегистрироваться.`
        );
      }
    }
    
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing event bot webhook');
    return NextResponse.json({ ok: true }); // Always return ok to Telegram
  }
}

/**
 * GET - Health check
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    bot: 'orbo_event_bot',
    description: 'Webhook for Orbo Event Bot (MiniApp for event registration)',
  });
}

/**
 * Send message via Telegram Bot API
 */
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: object
) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    console.error('[EventBot] Failed to send message:', errorData);
  }
}

