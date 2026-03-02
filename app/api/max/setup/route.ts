import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { createMaxService } from '@/lib/services/maxService';

/**
 * POST /api/max/setup
 * Sets up webhooks for all configured MAX bots.
 * Protected: requires superadmin auth.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/setup' });

  try {
    // Simple auth check via header (for superadmin use)
    const authHeader = request.headers.get('authorization');
    const setupSecret = process.env.MAX_SETUP_SECRET || process.env.MAX_WEBHOOK_SECRET;
    if (setupSecret && authHeader !== `Bearer ${setupSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    const webhookSecret = process.env.MAX_WEBHOOK_SECRET || '';

    const results: Record<string, any> = {};

    // Main bot
    if (process.env.MAX_MAIN_BOT_TOKEN) {
      try {
        const mainService = createMaxService('main');
        const mainResult = await mainService.setWebhook(
          `${siteUrl}/api/max/webhook`,
          ['message_created', 'bot_added', 'bot_removed', 'user_added', 'user_removed', 'message_callback'],
          webhookSecret,
        );
        results.main = mainResult;
        logger.info({ result: mainResult }, 'MAX Main bot webhook set');
      } catch (e: any) {
        results.main = { ok: false, error: e.message };
        logger.error({ error: e.message }, 'Failed to set main bot webhook');
      }
    } else {
      results.main = { ok: false, error: 'MAX_MAIN_BOT_TOKEN not configured' };
    }

    // Event bot
    if (process.env.MAX_EVENT_BOT_TOKEN) {
      try {
        const eventService = createMaxService('event');
        const eventResult = await eventService.setWebhook(
          `${siteUrl}/api/max/event-bot/webhook`,
          ['bot_started', 'message_created', 'message_callback'],
          webhookSecret,
        );
        results.event = eventResult;
        logger.info({ result: eventResult }, 'MAX Event bot webhook set');
      } catch (e: any) {
        results.event = { ok: false, error: e.message };
        logger.error({ error: e.message }, 'Failed to set event bot webhook');
      }
    } else {
      results.event = { ok: false, error: 'MAX_EVENT_BOT_TOKEN not configured' };
    }

    // Notifications bot
    if (process.env.MAX_NOTIFICATIONS_BOT_TOKEN) {
      try {
        const notifService = createMaxService('notifications');
        const notifResult = await notifService.setWebhook(
          `${siteUrl}/api/max/notifications-bot/webhook`,
          ['bot_started', 'message_created'],
          webhookSecret,
        );
        results.notifications = notifResult;
        logger.info({ result: notifResult }, 'MAX Notifications bot webhook set');
      } catch (e: any) {
        results.notifications = { ok: false, error: e.message };
        logger.error({ error: e.message }, 'Failed to set notifications bot webhook');
      }
    } else {
      results.notifications = { ok: false, error: 'MAX_NOTIFICATIONS_BOT_TOKEN not configured' };
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error setting up MAX webhooks');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/max/setup
 * Get current webhook subscriptions for all configured bots.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/setup' });

  try {
    const results: Record<string, any> = {};

    if (process.env.MAX_MAIN_BOT_TOKEN) {
      try {
        const svc = createMaxService('main');
        const me = await svc.getMe();
        const subs = await svc.getWebhooks();
        results.main = { me: me.data, subscriptions: subs.data };
      } catch (e: any) {
        results.main = { error: e.message };
      }
    }

    if (process.env.MAX_EVENT_BOT_TOKEN) {
      try {
        const svc = createMaxService('event');
        const me = await svc.getMe();
        const subs = await svc.getWebhooks();
        results.event = { me: me.data, subscriptions: subs.data };
      } catch (e: any) {
        results.event = { error: e.message };
      }
    }

    if (process.env.MAX_NOTIFICATIONS_BOT_TOKEN) {
      try {
        const svc = createMaxService('notifications');
        const me = await svc.getMe();
        const subs = await svc.getWebhooks();
        results.notifications = { me: me.data, subscriptions: subs.data };
      } catch (e: any) {
        results.notifications = { error: e.message };
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error getting MAX webhook status');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
