import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { createMaxService } from '@/lib/services/maxService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/max/notifications-bot/webhook
 * Webhook for MAX Notifications Bot.
 * Users send /start here to open a dialog, then receive verification codes and system notifications.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/notifications-bot/webhook', botType: 'max-notifications' });

  const expectedSecret = process.env.MAX_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get('x-max-bot-api-secret');

  if (expectedSecret && receivedSecret !== expectedSecret) {
    logger.warn({ received: !!receivedSecret }, 'Unauthorized - secret mismatch');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updateType = body.update_type;

    logger.debug({ update_type: updateType }, '📨 [MAX-NOTIF-WEBHOOK] Received update');

    if (updateType === 'bot_started' || updateType === 'message_created') {
      await handleStartOrMessage(body, logger).catch((err) => {
        logger.error({ error: err.message }, 'Notifications bot webhook processing failed');
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error parsing MAX notifications webhook');
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    bot: 'max-notifications',
    description: 'MAX Notifications Bot Webhook',
  });
}

async function handleStartOrMessage(body: any, logger: any) {
  // bot_started: { user, chat_id, payload }
  // message_created: { message: { sender, recipient, body } }
  const isMessageCreated = body.update_type === 'message_created';

  const userId: number | undefined = isMessageCreated
    ? body.message?.sender?.user_id
    : body.user?.user_id;

  if (!userId) return;

  // Only react to /start in message_created
  if (isMessageCreated) {
    const text: string = body.message?.body?.text?.trim() || '';
    if (!text.startsWith('/start')) return;
  }

  const maxService = createMaxService('notifications');
  const supabase = createAdminServer();

  // Check for pending verification code
  const { data: pendingAccount } = await supabase
    .from('user_max_accounts')
    .select('verification_code, verification_expires_at')
    .eq('max_user_id', userId)
    .eq('is_verified', false)
    .gt('verification_expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let replyText: string;
  if (pendingAccount?.verification_code) {
    replyText =
      `👋 Привет от Orbo!\n\n` +
      `Ваш MAX User ID: <b>${userId}</b>\n\n` +
      `🔐 Ваш код верификации:\n<b>${pendingAccount.verification_code}</b>\n\n` +
      `⏰ Код действителен 15 минут\n` +
      `Введите его на странице настроек Orbo.`;
  } else {
    replyText =
      `👋 Привет от Orbo!\n\n` +
      `Ваш MAX User ID: <b>${userId}</b>\n\n` +
      `Используйте этот ID на странице настроек Orbo для привязки аккаунта.\n` +
      `После ввода ID код верификации будет отправлен сюда.`;
  }

  await maxService.sendMessageToUser(userId, replyText, { format: 'html' });
  logger.info({ max_user_id: userId }, '✅ MAX notifications /start: sent reply');
}
