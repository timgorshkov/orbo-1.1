import { createClientServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/logAdminAction';

// POST /api/apps/[appId]/items/[itemId]/moderate - Moderate item (approve/reject)
export async function POST(
  request: NextRequest,
  { params }: { params: { appId: string; itemId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId, itemId } = params;
  
  try {
    const supabase = await createClientServer();
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

    // Get existing item
    const { data: existingItem, error: fetchError } = await supabase
      .from('app_items')
      .select('id, org_id, collection_id, creator_id, status, data')
      .eq('id', itemId)
      .single();

    if (fetchError || !existingItem) {
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

    // Update item
    const { data: item, error: updateError } = await supabase
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

    // TODO: Send notification to creator
    // If approved → send to Telegram group
    // If rejected → send DM to creator with reason

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

