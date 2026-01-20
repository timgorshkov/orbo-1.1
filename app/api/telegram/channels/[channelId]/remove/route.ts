/**
 * Remove Channel from Organization
 * 
 * DELETE /api/telegram/channels/[channelId]/remove?orgId=xxx
 * 
 * Removes the link between channel and organization (org_telegram_channels).
 * Does NOT delete:
 * - telegram_channels record
 * - channel_posts
 * - channel_subscribers
 * - activity_events
 * 
 * Channel can be re-added later with full history intact.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/services/adminActionsService';

export async function DELETE(
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
    
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // 1. Check user has admin/owner role in organization
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();
    
    if (membershipError) {
      logger.error({ error: membershipError.message }, 'Membership check error');
      return NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 });
    }
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ 
        error: 'Only owners and admins can remove channels' 
      }, { status: 403 });
    }
    
    // 2. Check channel exists
    const { data: channel, error: channelError } = await supabase
      .from('telegram_channels')
      .select('id, tg_chat_id, title')
      .eq('id', channelId)
      .maybeSingle();
    
    if (channelError || !channel) {
      logger.error({ error: channelError?.message, channel_id: channelId }, 'Channel not found');
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    
    // 3. Check channel is linked to this organization
    const { data: orgChannelLink, error: linkError } = await supabase
      .from('org_telegram_channels')
      .select('id')
      .eq('org_id', orgId)
      .eq('channel_id', channelId)
      .maybeSingle();
    
    if (linkError) {
      logger.error({ 
        error: linkError.message, 
        org_id: orgId, 
        channel_id: channelId 
      }, 'Error checking channel link');
      return NextResponse.json({ error: 'Failed to check channel link' }, { status: 500 });
    }
    
    if (!orgChannelLink) {
      logger.info({ org_id: orgId, channel_id: channelId }, 'Channel is not linked to this organization');
      return NextResponse.json({ 
        error: 'Channel is not linked to this organization' 
      }, { status: 400 });
    }
    
    // 4. Delete the org-channel link
    const { error: deleteError } = await supabase
      .from('org_telegram_channels')
      .delete()
      .eq('org_id', orgId)
      .eq('channel_id', channelId);
    
    if (deleteError) {
      logger.error({ 
        error: deleteError.message, 
        org_id: orgId, 
        channel_id: channelId 
      }, 'Error deleting org-channel link');
      return NextResponse.json({ 
        error: 'Failed to remove channel from organization' 
      }, { status: 500 });
    }
    
    logger.info({ 
      org_id: orgId, 
      channel_id: channelId 
    }, 'Successfully deleted org-channel link');
    
    // 5. Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.REMOVE_TELEGRAM_GROUP, // Reuse existing action or create new one
      resourceType: 'telegram_channel' as ResourceTypes,
      resourceId: channelId,
      metadata: {
        tg_chat_id: channel.tg_chat_id,
        channel_title: channel.title
      }
    });
    
    // 6. Check if channel is used by other organizations
    const { data: otherOrgs, error: otherOrgsError } = await supabase
      .from('org_telegram_channels')
      .select('org_id')
      .eq('channel_id', channelId)
      .limit(1);
    
    if (otherOrgsError) {
      logger.warn({ 
        error: otherOrgsError.message, 
        channel_id: channelId 
      }, 'Error checking other org links');
    }
    
    const isUsedByOthers = otherOrgs && otherOrgs.length > 0;
    
    logger.info({ 
      org_id: orgId, 
      channel_id: channelId,
      used_by_others: isUsedByOthers,
      duration: Date.now() - startTime
    }, 'Channel removed from organization');
    
    return NextResponse.json({
      success: true,
      message: 'Channel removed from organization',
      channelId,
      usedByOtherOrgs: isUsedByOthers
    });
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      channel_id: channelId
    }, 'Error in DELETE /api/telegram/channels/[channelId]/remove');
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
