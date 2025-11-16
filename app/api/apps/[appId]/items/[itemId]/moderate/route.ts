import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/logAdminAction';
import { notifyItemApproved, notifyItemRejected } from '@/lib/services/appsNotificationService';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// GET /api/apps/[appId]/items/[itemId]/moderate - Test endpoint
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; itemId: string }> }
) {
  const { appId, itemId } = await params;
  const logger = createAPILogger(request);
  logger.info({ appId, itemId }, '[MODERATE] GET endpoint called - route is working!');
  return NextResponse.json({ 
    message: 'Moderate endpoint is working',
    appId,
    itemId,
    method: 'GET'
  });
}

// POST /api/apps/[appId]/items/[itemId]/moderate - Moderate item (approve/reject)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; itemId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId, itemId } = await params;
  
  try {
    // ✅ Use separate clients: user client for auth, admin for DB operations
    const supabase = await createClientServer();
    const adminSupabase = createAdminServer();
    
    const body = await request.json();
    const { action, note } = body; // action: 'approve' | 'reject'

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Get existing item using admin client (bypasses RLS)
    const { data: existingItem, error: fetchError } = await adminSupabase
      .from('app_items')
      .select('id, org_id, collection_id, creator_id, status, data')
      .eq('id', itemId)
      .single();

    if (fetchError || !existingItem) {
      logger.error({ fetchError, itemId }, 'Item not found for moderation');
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Check moderator permissions
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingItem.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!['owner', 'admin', 'moderator'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only moderators can approve/reject items' },
        { status: 403 }
      );
    }

    // Determine new status
    const newStatus = action === 'approve' ? 'active' : 'rejected';

    // ✅ Update item using admin client (bypasses RLS)
    const { data: item, error: updateError } = await adminSupabase
      .from('app_items')
      .update({
        status: newStatus,
        moderated_by: user.id,
        moderated_at: new Date().toISOString(),
        moderation_note: note || null
      })
      .eq('id', itemId)
      .select()
      .single();

    if (updateError) {
      logger.error({ error: updateError, itemId, action }, 'Error moderating item');
      return NextResponse.json(
        { error: 'Failed to moderate item' },
        { status: 500 }
      );
    }

    // Log admin action
    await logAdminAction({
      userId: user.id,
      orgId: existingItem.org_id,
      action: action === 'approve' ? 'item_approved' : 'item_rejected',
      resourceType: 'app_item',
      resourceId: itemId,
      metadata: { 
        appId, 
        collectionId: existingItem.collection_id,
        note,
        itemData: existingItem.data
      }
    });

    // Log analytics event
    try {
      await supabase.rpc('log_app_event', {
        p_app_id: appId,
        p_event_type: action === 'approve' ? 'item_approved' : 'item_rejected',
        p_user_id: user.id,
        p_item_id: itemId,
        p_collection_id: existingItem.collection_id,
        p_data: { moderator_id: user.id, note }
      });
    } catch (err) {
      logger.error({ error: err }, 'Error logging analytics event');
    }

    // Send Telegram notifications
    if (action === 'approve') {
      // Post to Telegram group
      const notificationResult = await notifyItemApproved(itemId);
      if (!notificationResult.success) {
        logger.error({ 
          error: notificationResult.error, 
          itemId 
        }, 'Failed to send approval notification to Telegram');
      } else {
        logger.info({ 
          itemId, 
          messageId: notificationResult.messageId 
        }, 'Item posted to Telegram group');
      }
    } else if (action === 'reject') {
      // Send DM to creator
      const notificationResult = await notifyItemRejected(itemId, note);
      if (!notificationResult.success) {
        logger.error({ 
          error: notificationResult.error, 
          itemId 
        }, 'Failed to send rejection DM');
      } else {
        logger.info({ itemId }, 'Rejection DM sent to creator');
      }
    }

    const duration = Date.now() - startTime;
    logger.info({
      itemId,
      appId,
      action,
      newStatus,
      duration
    }, 'Item moderated successfully');

    return NextResponse.json({ item });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      itemId,
      duration 
    }, 'Error in POST /api/apps/[appId]/items/[itemId]/moderate');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

