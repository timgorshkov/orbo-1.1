import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';

export const dynamic = 'force-dynamic';

/**
 * API endpoint to manually setup Telegram webhook
 * Only accessible by superadmins
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check superadmin status using admin client (bypass RLS)
    const supabaseAdmin = createAdminServer();
    const { data: superadmin, error: superadminError } = await supabaseAdmin
      .from('superadmins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (superadminError || !superadmin) {
      console.error('[Superadmin] Access denied:', { userId: user.id, error: superadminError });
      return NextResponse.json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
    }

    // Get bot type from request
    const { botType } = await req.json();
    
    if (!botType || !['main', 'notifications'].includes(botType)) {
      return NextResponse.json({ error: 'Invalid botType. Must be "main" or "notifications"' }, { status: 400 });
    }

    // Setup webhook
    const webhookSecret = botType === 'notifications'
      ? (process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET)
      : process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    const webhookUrl = botType === 'main'
      ? `${baseUrl}/api/telegram/webhook`
      : `${baseUrl}/api/telegram/notifications/webhook`;

    console.log(`[Superadmin] Setting webhook for ${botType} bot:`, webhookUrl);

    const telegramService = new TelegramService(botType);

    // Set webhook with all required updates
    const result = await telegramService.setWebhookAdvanced({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: botType === 'main'
        ? ['message', 'chat_member', 'my_chat_member', 'message_reaction']
        : ['message'],
      drop_pending_updates: false,
      max_connections: 40
    });

    if (!result.ok) {
      console.error('[Superadmin] Failed to set webhook:', result);
      return NextResponse.json({
        error: 'Failed to set webhook',
        details: result.description || 'Unknown error'
      }, { status: 500 });
    }

    console.log(`[Superadmin] ✅ Webhook successfully set for ${botType} bot`);

    // Get webhook info to verify
    const webhookResponse = await telegramService.getWebhookInfo();
    const webhookInfo = webhookResponse.result || webhookResponse;

    return NextResponse.json({
      success: true,
      botType,
      webhook: {
        url: webhookInfo.url || '',
        hasCustomCertificate: webhookInfo.has_custom_certificate || false,
        pendingUpdateCount: webhookInfo.pending_update_count || 0,
        lastErrorDate: webhookInfo.last_error_date,
        lastErrorMessage: webhookInfo.last_error_message,
        maxConnections: webhookInfo.max_connections || 40,
        allowedUpdates: webhookInfo.allowed_updates || []
      }
    });
  } catch (error: any) {
    console.error('[Superadmin] Error setting webhook:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Get current webhook info
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check superadmin status using admin client (bypass RLS)
    const supabaseAdmin = createAdminServer();
    const { data: superadmin, error: superadminError } = await supabaseAdmin
      .from('superadmins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (superadminError || !superadmin) {
      console.error('[Superadmin] Access denied:', { userId: user.id, error: superadminError });
      return NextResponse.json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
    }

    // Get webhook info for both bots
    const mainService = new TelegramService('main');
    const notificationsService = new TelegramService('notifications');

    const [mainResponse, notificationsResponse] = await Promise.all([
      mainService.getWebhookInfo(),
      notificationsService.getWebhookInfo()
    ]);

    // Extract result from Telegram API response
    const mainInfo = mainResponse.result || mainResponse;
    const notificationsInfo = notificationsResponse.result || notificationsResponse;

    return NextResponse.json({
      main: {
        url: mainInfo.url || '',
        hasCustomCertificate: mainInfo.has_custom_certificate || false,
        pendingUpdateCount: mainInfo.pending_update_count || 0,
        lastErrorDate: mainInfo.last_error_date,
        lastErrorMessage: mainInfo.last_error_message,
        maxConnections: mainInfo.max_connections || 40,
        allowedUpdates: mainInfo.allowed_updates || []
      },
      notifications: {
        url: notificationsInfo.url || '',
        hasCustomCertificate: notificationsInfo.has_custom_certificate || false,
        pendingUpdateCount: notificationsInfo.pending_update_count || 0,
        lastErrorDate: notificationsInfo.last_error_date,
        lastErrorMessage: notificationsInfo.last_error_message,
        maxConnections: notificationsInfo.max_connections || 40,
        allowedUpdates: notificationsInfo.allowed_updates || []
      }
    });
  } catch (error: any) {
    console.error('[Superadmin] Error getting webhook info:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    }, { status: 500 });
  }
}

