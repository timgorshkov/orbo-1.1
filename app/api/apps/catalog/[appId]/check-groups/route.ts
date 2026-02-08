import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { requireOrgAccess } from '@/lib/orgGuard';
import { TelegramService } from '@/lib/services/telegramService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/apps/catalog/[appId]/check-groups
 * 
 * Checks which org groups have the partner bot installed.
 * Uses our main bot to call getChatMember for each group.
 * 
 * Body: { orgId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = await params;
  
  try {
    const body = await request.json();
    const { orgId } = body;
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }
    
    // Auth check
    try {
      await requireOrgAccess(orgId, ['owner', 'admin']);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Get the partner app's bot_username
    const { data: app, error: appError } = await adminSupabase
      .from('public_apps')
      .select('id, name, bot_username')
      .eq('id', appId)
      .single();
    
    if (appError || !app || !app.bot_username) {
      return NextResponse.json({ error: 'App not found or has no bot' }, { status: 404 });
    }
    
    // Get org's active telegram groups via org_telegram_groups mapping
    const { data: mappings, error: mappingsError } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)
      .eq('status', 'active');
    
    if (mappingsError || !mappings || mappings.length === 0) {
      return NextResponse.json({ 
        connected_groups: [],
        total_checked: 0,
        total_connected: 0,
        message: 'No active groups found' 
      });
    }
    
    // Get group details from telegram_groups
    const chatIds = mappings.map((m: any) => m.tg_chat_id);
    const { data: groups, error: groupsError } = await adminSupabase
      .from('telegram_groups')
      .select('tg_chat_id, title')
      .in('tg_chat_id', chatIds)
      .eq('is_archived', false);
    
    if (groupsError || !groups || groups.length === 0) {
      return NextResponse.json({ 
        connected_groups: [],
        total_checked: 0,
        total_connected: 0,
        message: 'No active groups found' 
      });
    }
    
    // Resolve bot's numeric user ID using our main bot
    const tgService = new TelegramService('main');
    let botUserId: number | null = null;
    
    try {
      // Try to get bot info by calling getChat with @username
      // This works if the bot has been seen by our bot
      const botInfoUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChat`;
      const botInfoResp = await fetch(botInfoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: `@${app.bot_username}` })
      });
      
      if (botInfoResp.ok) {
        const botInfoData = await botInfoResp.json();
        if (botInfoData.ok && botInfoData.result?.id) {
          botUserId = botInfoData.result.id;
        }
      }
    } catch (err) {
      logger.warn({ bot_username: app.bot_username, error: err }, 'Failed to resolve bot user ID via getChat');
    }
    
    if (!botUserId) {
      return NextResponse.json({ 
        error: 'Could not resolve bot user ID. Bot may not be accessible.',
        connected_groups: [] 
      }, { status: 200 });
    }
    
    logger.info({ 
      app_name: app.name, 
      bot_username: app.bot_username, 
      bot_user_id: botUserId,
      groups_count: groups.length 
    }, 'Checking partner bot presence in groups');
    
    // Check each group for the partner bot
    const connectedGroups: Array<{ chat_id: string; title: string; connected_at: string }> = [];
    
    for (const group of groups) {
      try {
        const memberUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`;
        const memberResp = await fetch(memberUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: group.tg_chat_id, 
            user_id: botUserId 
          })
        });
        
        if (memberResp.ok) {
          const memberData = await memberResp.json();
          if (memberData.ok && memberData.result) {
            const status = memberData.result.status;
            // Bot is present if status is member, administrator, or creator
            if (['member', 'administrator', 'creator'].includes(status)) {
              connectedGroups.push({
                chat_id: group.tg_chat_id,
                title: group.title || 'Unnamed',
                connected_at: new Date().toISOString()
              });
            }
          }
        }
      } catch (err) {
        logger.warn({ 
          chat_id: group.tg_chat_id, 
          error: err 
        }, 'Error checking bot membership in group');
      }
    }
    
    // Update the connected_groups field in public_app_connections
    const { error: updateError } = await adminSupabase
      .from('public_app_connections')
      .update({ 
        connected_groups: connectedGroups,
        updated_at: new Date().toISOString()
      })
      .eq('public_app_id', appId)
      .eq('org_id', orgId)
      .eq('status', 'active');
    
    if (updateError) {
      logger.warn({ error: updateError.message }, 'Failed to update connected_groups');
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      app_name: app.name,
      groups_checked: groups.length,
      connected_count: connectedGroups.length,
      duration 
    }, 'Partner bot group check completed');
    
    return NextResponse.json({ 
      connected_groups: connectedGroups,
      total_checked: groups.length,
      total_connected: connectedGroups.length
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in POST /api/apps/catalog/[appId]/check-groups');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
