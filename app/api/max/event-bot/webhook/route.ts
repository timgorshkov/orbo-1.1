import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getMaxEventBotToken, extractEventId } from '@/lib/max/webAppAuth';
import { createMaxService, MaxService } from '@/lib/services/maxService';

/**
 * POST /api/max/event-bot/webhook
 * Webhook for MAX Event Bot.
 * Handles /start command with deep link to open event MiniApp.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/event-bot/webhook' });

  // Verify webhook secret
  const expectedSecret = process.env.MAX_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get('x-max-bot-api-secret');

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    logger.warn({ received: !!receivedSecret, configured: !!expectedSecret }, 'Unauthorized - secret mismatch');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updateType = body.update_type;

    logger.debug({ update_type: updateType }, '📨 [MAX-EVENT-WEBHOOK] Update received');

    if (updateType === 'bot_started') {
      await handleBotStarted(body, logger);
    } else if (updateType === 'message_created') {
      await handleMessageCreated(body, logger);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing MAX event bot webhook');
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    bot: 'max-event',
    description: 'MAX Event Bot Webhook (MiniApp for event registration)',
  });
}

// ─── bot_started ────────────────────────────────────────────

async function handleBotStarted(body: any, logger: any) {
  const userId = body.user?.user_id;
  const payload = body.payload; // startapp parameter

  if (!userId) return;

  const botToken = getMaxEventBotToken();
  if (!botToken) {
    logger.error({}, 'MAX_EVENT_BOT_TOKEN not configured');
    return;
  }

  let maxService: MaxService;
  try {
    maxService = createMaxService('event');
  } catch {
    logger.error({}, 'Failed to create MaxService for event bot');
    return;
  }

  const eventId = extractEventId(payload);

  if (eventId) {
    const supabase = createAdminServer();

    const { data: event } = await supabase
      .from('events')
      .select('title, event_date, cover_image_url, status')
      .eq('id', eventId)
      .single();

    if (event && event.status === 'published') {
      const eventDate = new Date(event.event_date).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      });

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
      const webAppUrl = `${siteUrl}/max-app/events/${eventId}`;

      const messageText = `📅 *${event.title}*\n\n🗓 ${eventDate}\n\nНажмите кнопку ниже для регистрации:`;

      const keyboard = MaxService.buildOpenAppKeyboard('✅ Зарегистрироваться', webAppUrl);

      await maxService.sendMessageToUser(userId, messageText, {
        format: 'markdown',
        attachments: [keyboard],
      });
    } else {
      await maxService.sendMessageToUser(
        userId,
        '❌ Событие не найдено или недоступно для регистрации.',
      );
    }
  } else {
    await maxService.sendMessageToUser(
      userId,
      '👋 Привет!\n\nЯ бот для регистрации на события через Orbo.\n\nПерейдите по ссылке события, чтобы зарегистрироваться.',
    );
  }
}

// ─── message_created (handle /start text command) ───────────

async function handleMessageCreated(body: any, logger: any) {
  const message = body.message;
  if (!message?.body?.text) return;

  const text: string = message.body.text;
  if (!text.startsWith('/start')) return;

  const parts = text.split(' ');
  const startParam = parts[1];
  const userId = message.sender?.user_id;

  if (!userId) return;

  // Delegate to the same logic as bot_started
  await handleBotStarted(
    { user: { user_id: userId }, payload: startParam },
    logger,
  );
}
