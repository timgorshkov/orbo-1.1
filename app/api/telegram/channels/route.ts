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
    const { orgId, tgChatId, title, username, isPrimary } = body;
    
    if (!orgId || !tgChatId) {
      return NextResponse.json(
        { error: 'orgId and tgChatId are required' },
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
    
    // Create or update channel
    const { data: channelId, error: channelError } = await supabase
      .rpc('upsert_telegram_channel', {
        p_tg_chat_id: tgChatId,
        p_title: title || `Channel ${tgChatId}`,
        p_username: username || null
      });
    
    if (channelError) {
      logger.error({ error: channelError, tg_chat_id: tgChatId }, 'Failed to upsert channel');
      return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 });
    }
    
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
