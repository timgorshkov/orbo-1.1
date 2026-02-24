/**
 * Telegram Channels API
 * 
 * GET  /api/telegram/channels?org_id=xxx - List channels for organization
 * POST /api/telegram/channels - Add channel to organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

// GET - List channels for organization
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  const startTime = Date.now();
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    
    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // Check membership
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Get channels using RPC
    const { data: channels, error: channelsError } = await supabase
      .rpc('get_org_channels', { p_org_id: orgId });
    
    if (channelsError) {
      logger.error({ error: channelsError, org_id: orgId }, 'Failed to get channels');
      return NextResponse.json({ error: 'Failed to get channels' }, { status: 500 });
    }
    
    logger.info({
      org_id: orgId,
      count: channels?.length || 0,
      duration: Date.now() - startTime
    }, 'Channels fetched');
    
    return NextResponse.json({ channels: channels || [] });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/telegram/channels');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add channel to organization
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request);
  const startTime = Date.now();
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    // Support both snake_case (from frontend) and camelCase
    const orgId = body.org_id || body.orgId;
    const tgChatId = body.tg_chat_id || body.tgChatId;
    const username = body.username;
    const title = body.title;
    const isPrimary = body.is_primary || body.isPrimary;
    
    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }
    
    if (!tgChatId && !username) {
      return NextResponse.json(
        { error: 'Either tg_chat_id or username is required' },
        { status: 400 }
      );
    }
    
    const supabase = createAdminServer();
    
    // Check admin/owner role
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can add channels' },
        { status: 403 }
      );
    }
    
    let finalTgChatId = tgChatId;
    let channelTitle = title;
    
    // If we have username but no tgChatId, try to resolve it via Telegram API
    // For now, we'll create a placeholder that will be updated when the bot receives a message
    if (!finalTgChatId && username) {
      // Check if channel already exists by username
      const { data: existingChannel } = await supabase
        .from('telegram_channels')
        .select('id, tg_chat_id')
        .eq('username', username.toLowerCase())
        .single();
      
      if (existingChannel) {
        finalTgChatId = existingChannel.tg_chat_id;
      } else {
        // Create with a temporary negative ID (will be updated when bot receives data)
        // For Telegram channels, IDs are typically negative and start with -100
        // We'll use a random negative ID that will be replaced
        finalTgChatId = -100000000000 - Math.floor(Math.random() * 1000000);
        channelTitle = channelTitle || `@${username}`;
      }
    }
    
    // Create or update channel
    const { data: rpcResult, error: channelError } = await supabase
      .rpc('upsert_telegram_channel', {
        p_tg_chat_id: finalTgChatId,
        p_title: channelTitle || `Channel ${finalTgChatId}`,
        p_username: username || null
      });
    
    if (channelError) {
      logger.error({ error: channelError, tg_chat_id: finalTgChatId, username }, 'Failed to upsert channel');
      return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 });
    }
    
    // Extract channel ID from RPC result
    // RPC can return either a UUID directly or an array with objects
    let channelId: string;
    if (typeof rpcResult === 'string') {
      channelId = rpcResult;
    } else if (Array.isArray(rpcResult) && rpcResult.length > 0) {
      // Handle array result like [{"upsert_telegram_channel": "uuid"}]
      const firstItem = rpcResult[0];
      channelId = firstItem.upsert_telegram_channel || firstItem.id || firstItem;
    } else if (rpcResult && typeof rpcResult === 'object') {
      channelId = (rpcResult as any).upsert_telegram_channel || (rpcResult as any).id;
    } else {
      logger.error({ rpc_result: rpcResult }, 'Unexpected RPC result format');
      return NextResponse.json({ error: 'Failed to get channel ID' }, { status: 500 });
    }
    
    logger.info({ channel_id: channelId, rpc_result: rpcResult }, 'Channel upserted');
    
    // Link channel to organization
    const { error: linkError } = await supabase
      .from('org_telegram_channels')
      .upsert({
        org_id: orgId,
        channel_id: channelId,
        created_by: user.id,
        is_primary: isPrimary || false
      }, { onConflict: 'org_id,channel_id' });
    
    if (linkError) {
      logger.error({ error: linkError, org_id: orgId, channel_id: channelId }, 'Failed to link channel');
      return NextResponse.json({ error: 'Failed to link channel to organization' }, { status: 500 });
    }
    
    logger.info({
      org_id: orgId,
      channel_id: channelId,
      tg_chat_id: tgChatId,
      duration: Date.now() - startTime
    }, 'Channel added to organization');
    
    logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.CONNECT_CHANNEL,
      resourceType: ResourceTypes.CHANNEL,
      resourceId: channelId,
      metadata: { tg_chat_id: tgChatId, username, title: channelTitle },
    }).catch(() => {});
    
    return NextResponse.json({
      success: true,
      channelId,
      message: 'Channel added successfully'
    }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error in POST /api/telegram/channels');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
