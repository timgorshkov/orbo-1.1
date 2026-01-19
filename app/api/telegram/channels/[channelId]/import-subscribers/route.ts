/**
 * Import Channel Subscribers from Discussion Group
 * 
 * POST /api/telegram/channels/[channelId]/import-subscribers
 * Body: { source: "discussion_group" }
 * 
 * Imports all members from the channel's linked discussion group
 * as channel subscribers and participants.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { TelegramService } from '@/lib/services/telegramService';

export async function POST(
  request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const logger = createAPILogger(request);
  const startTime = Date.now();
  const { channelId } = params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { source = 'discussion_group' } = await request.json();
    
    if (source !== 'discussion_group') {
      return NextResponse.json({ 
        error: 'Only discussion_group source is currently supported' 
      }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // 1. Get channel and verify access
    const { data: channel, error: channelError } = await supabase
      .from('telegram_channels')
      .select('id, tg_chat_id, title, linked_chat_id')
      .eq('id', channelId)
      .single();
    
    if (channelError || !channel) {
      logger.error({ error: channelError, channel_id: channelId }, 'Channel not found');
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    
    // 2. Get organization for this channel
    const { data: orgChannel, error: orgError } = await supabase
      .from('org_telegram_channels')
      .select('org_id')
      .eq('channel_id', channelId)
      .single();
    
    if (orgError || !orgChannel) {
      logger.error({ error: orgError, channel_id: channelId }, 'Channel not linked to org');
      return NextResponse.json({ error: 'Channel not linked to organization' }, { status: 404 });
    }
    
    // 3. Check user has admin access to org
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgChannel.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // 4. Check if discussion group is linked
    if (!channel.linked_chat_id) {
      return NextResponse.json({ 
        error: 'No discussion group linked to this channel',
        hint: 'Enable comments for this channel in Telegram settings'
      }, { status: 400 });
    }
    
    logger.info({ 
      channel_id: channelId,
      discussion_group_id: channel.linked_chat_id,
      org_id: orgChannel.org_id
    }, 'Starting subscriber import from discussion group');
    
    // 5. Get discussion group members via Telegram API
    const telegramService = new TelegramService('main');
    let members: any[] = [];
    
    try {
      // First try to get member count
      const countResult = await telegramService.getChatMembersCount(channel.linked_chat_id);
      logger.info({ 
        discussion_group_id: channel.linked_chat_id,
        member_count: countResult.result 
      }, 'Discussion group member count');
      
      // Get administrators (we can only get admins via Bot API)
      const adminsResult = await telegramService.getChatAdministrators(channel.linked_chat_id);
      if (adminsResult.ok && adminsResult.result) {
        members = adminsResult.result;
      }
      
      logger.info({ 
        admins_count: members.length,
        discussion_group_id: channel.linked_chat_id
      }, 'Retrieved discussion group admins');
      
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        discussion_group_id: channel.linked_chat_id
      }, 'Failed to get discussion group members');
      return NextResponse.json({ 
        error: 'Failed to access discussion group',
        details: 'Bot may not have access to the discussion group'
      }, { status: 500 });
    }
    
    // 6. Import members as participants and channel subscribers
    let imported = 0;
    let skipped = 0;
    const errors: any[] = [];
    
    for (const member of members) {
      if (!member.user || member.user.is_bot) {
        skipped++;
        continue;
      }
      
      const tgUserId = member.user.id;
      const username = member.user.username || null;
      const firstName = member.user.first_name || null;
      const lastName = member.user.last_name || null;
      
      try {
        // Create/update participant
        const { error: participantError } = await supabase
          .from('participants')
          .upsert({
            org_id: orgChannel.org_id,
            tg_user_id: tgUserId,
            username,
            first_name: firstName,
            last_name: lastName,
            source: 'channel_discussion_import'
          }, { 
            onConflict: 'org_id,tg_user_id',
            ignoreDuplicates: false 
          });
        
        if (participantError) {
          logger.warn({ 
            error: participantError.message,
            tg_user_id: tgUserId
          }, 'Failed to create participant');
          errors.push({ tg_user_id: tgUserId, error: participantError.message });
          continue;
        }
        
        // Create/update channel subscriber
        const { error: subscriberError } = await supabase
          .rpc('upsert_channel_subscriber_from_comment', {
            p_channel_tg_id: channel.tg_chat_id,
            p_tg_user_id: tgUserId,
            p_username: username,
            p_first_name: firstName,
            p_last_name: lastName
          });
        
        if (subscriberError) {
          logger.warn({ 
            error: subscriberError.message,
            tg_user_id: tgUserId
          }, 'Failed to create channel subscriber');
          errors.push({ tg_user_id: tgUserId, error: subscriberError.message });
          continue;
        }
        
        imported++;
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : String(error),
          tg_user_id: tgUserId
        }, 'Unexpected error during import');
        errors.push({ 
          tg_user_id: tgUserId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    // 7. Sync channel_subscribers with participants
    await supabase.rpc('sync_channel_subscribers_with_participants');
    
    logger.info({
      channel_id: channelId,
      imported,
      skipped,
      errors: errors.length,
      duration: Date.now() - startTime
    }, 'Subscriber import completed');
    
    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.length,
      total_members: members.length,
      details: errors.length > 0 ? errors.slice(0, 10) : undefined // Return first 10 errors
    });
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      channel_id: channelId
    }, 'Error in import-subscribers');
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
