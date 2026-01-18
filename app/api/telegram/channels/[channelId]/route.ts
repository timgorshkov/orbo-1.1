/**
 * Single Channel API
 * 
 * GET    /api/telegram/channels/[channelId] - Get channel details
 * DELETE /api/telegram/channels/[channelId] - Remove channel from org
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

interface RouteParams {
  params: { channelId: string };
}

// GET - Get channel details with stats
export async function GET(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const startTime = Date.now();
  const { channelId } = params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const days = parseInt(searchParams.get('days') || '30');
    
    const supabase = createAdminServer();
    
    // Check access via org membership (if orgId provided) or channel access
    if (orgId) {
      const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .single();
      
      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }
    
    // Get channel details
    const { data: channel, error: channelError } = await supabase
      .from('telegram_channels')
      .select(`
        id,
        tg_chat_id,
        username,
        title,
        description,
        subscriber_count,
        subscriber_count_updated_at,
        linked_chat_id,
        bot_status,
        photo_url,
        last_post_at,
        created_at
      `)
      .eq('id', channelId)
      .single();
    
    if (channelError || !channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    
    // Get stats
    const { data: stats, error: statsError } = await supabase
      .rpc('get_channel_stats', {
        p_channel_id: channelId,
        p_days: days
      })
      .single();
    
    if (statsError) {
      logger.warn({ error: statsError, channel_id: channelId }, 'Failed to get channel stats');
    }
    
    // Get org connection info if orgId provided
    let orgConnection = null;
    if (orgId) {
      const { data: connection } = await supabase
        .from('org_telegram_channels')
        .select('is_primary, track_analytics, created_at')
        .eq('org_id', orgId)
        .eq('channel_id', channelId)
        .single();
      orgConnection = connection;
    }
    
    logger.info({
      channel_id: channelId,
      duration: Date.now() - startTime
    }, 'Channel details fetched');
    
    return NextResponse.json({
      channel: {
        ...channel,
        stats: stats || null,
        orgConnection
      }
    });
  } catch (error) {
    logger.error({ error, channel_id: channelId }, 'Error in GET /api/telegram/channels/[channelId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove channel from organization
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const startTime = Date.now();
  const { channelId } = params;
  
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
    
    // Check admin/owner role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Remove channel from org
    const { error: deleteError } = await supabase
      .from('org_telegram_channels')
      .delete()
      .eq('org_id', orgId)
      .eq('channel_id', channelId);
    
    if (deleteError) {
      logger.error({ error: deleteError, org_id: orgId, channel_id: channelId }, 'Failed to remove channel');
      return NextResponse.json({ error: 'Failed to remove channel' }, { status: 500 });
    }
    
    logger.info({
      org_id: orgId,
      channel_id: channelId,
      duration: Date.now() - startTime
    }, 'Channel removed from organization');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error, channel_id: channelId }, 'Error in DELETE /api/telegram/channels/[channelId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
