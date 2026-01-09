import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { getUserRoleInOrg } from '@/lib/auth/getUserRole';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/archive' });
  let chatId: string | number | undefined;
  let orgId: string | undefined;
  try {
    const body = await request.json();
    chatId = body.chatId;
    orgId = body.orgId;
    const reason = body.reason;

    if (!chatId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info({ chat_id: chatId, org_id: orgId, reason, user_id: user.id }, 'Archiving group');

    const supabaseService = createAdminServer();

    const { data: membership, error: membershipError } = await supabaseService
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await supabaseService
      .from('org_telegram_groups')
      .update({ status: 'archived', archived_at: new Date().toISOString(), archived_reason: reason || null })
      .eq('org_id', orgId)
      .filter('tg_chat_id::text', 'eq', String(chatId));

    const { count } = await supabaseService
      .from('org_telegram_groups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .filter('tg_chat_id::text', 'eq', String(chatId));

    if (!count || count === 0) {
      await supabaseService
        .from('telegram_groups')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: reason || null
        })
        .filter('tg_chat_id::text', 'eq', String(chatId));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      chat_id: chatId,
      org_id: orgId
    }, 'Error archiving mapping');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE - Restore/Unarchive a group
 */
export async function DELETE(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/archive' });
  let chatId: string | number | undefined;
  let orgId: string | undefined;
  
  try {
    const url = new URL(request.url);
    chatId = url.searchParams.get('chatId') || undefined;
    orgId = url.searchParams.get('orgId') || undefined;

    if (!chatId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters (chatId, orgId)' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info({ chat_id: chatId, org_id: orgId, user_id: user.id }, 'Restoring group');

    const supabaseService = createAdminServer();

    // Check membership
    const { data: membership, error: membershipError } = await supabaseService
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if bot is still in the group
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    let botIsActive = false;
    
    if (botToken) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`
        );
        const data = await response.json();
        botIsActive = data.ok;
        
        if (!botIsActive) {
          logger.warn({ chat_id: chatId, error: data.description }, 'Bot is not in the group');
          return NextResponse.json({ 
            error: 'Cannot restore: bot is not a member of this group. Please add the bot first.',
            bot_error: data.description
          }, { status: 400 });
        }
      } catch (e) {
        logger.warn({ chat_id: chatId, error: String(e) }, 'Error checking bot status');
      }
    }

    // Restore in org_telegram_groups
    await supabaseService
      .from('org_telegram_groups')
      .update({ 
        status: 'active', 
        archived_at: null, 
        archived_reason: null 
      })
      .eq('org_id', orgId)
      .filter('tg_chat_id::text', 'eq', String(chatId));

    // Restore in telegram_groups
    await supabaseService
      .from('telegram_groups')
      .update({
        is_archived: false,
        archived_at: null,
        archived_reason: null,
        bot_status: botIsActive ? 'connected' : 'pending'
      })
      .filter('tg_chat_id::text', 'eq', String(chatId));

    logger.info({ chat_id: chatId, org_id: orgId }, 'Group restored successfully');

    return NextResponse.json({ success: true, restored: true });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      chat_id: chatId,
      org_id: orgId
    }, 'Error restoring group');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}