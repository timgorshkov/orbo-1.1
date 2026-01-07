import { NextRequest, NextResponse } from 'next/server';
import { getEventBotToken } from '@/lib/telegram/webAppAuth';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * POST /api/telegram/event-bot/setup
 * Setup webhook for @orbo_event_bot
 * Only accessible by superadmin
 */
export async function POST(request: NextRequest) {
  try {
    // Check if superadmin via unified auth
    const user = await getUnifiedUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check superadmin email
    const superadminEmails = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim());
    if (!superadminEmails.includes(user.email || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const botToken = getEventBotToken();
    if (!botToken) {
      return NextResponse.json({ error: 'TELEGRAM_EVENT_BOT_TOKEN not configured' }, { status: 500 });
    }
    
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://my.orbo.ru';
    const webhookUrl = `${siteUrl}/api/telegram/event-bot/webhook`;
    
    // Set webhook
    const setWebhookUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const response = await fetch(setWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      }),
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      return NextResponse.json({ 
        error: 'Failed to set webhook',
        details: result
      }, { status: 500 });
    }
    
    // Get webhook info
    const getInfoUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    const infoResponse = await fetch(getInfoUrl);
    const info = await infoResponse.json();
    
    return NextResponse.json({
      success: true,
      webhook_url: webhookUrl,
      webhook_info: info.result,
    });
    
  } catch (error: any) {
    console.error('[EventBot Setup] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET - Get current webhook status
 */
export async function GET(request: NextRequest) {
  try {
    const botToken = getEventBotToken();
    if (!botToken) {
      return NextResponse.json({ 
        configured: false,
        error: 'TELEGRAM_EVENT_BOT_TOKEN not set'
      });
    }
    
    const getInfoUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    const response = await fetch(getInfoUrl);
    const info = await response.json();
    
    // Get bot info
    const getMeUrl = `https://api.telegram.org/bot${botToken}/getMe`;
    const meResponse = await fetch(getMeUrl);
    const me = await meResponse.json();
    
    return NextResponse.json({
      configured: true,
      bot: me.result,
      webhook: info.result,
    });
    
  } catch (error: any) {
    return NextResponse.json({ 
      configured: false,
      error: error.message 
    });
  }
}

