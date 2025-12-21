import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

// GET /api/apps/[appId]/items/[itemId] - Get item details (PUBLIC)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; itemId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId, itemId } = await params;
  
  try {
    // Use admin client for public read access (no RLS restrictions)
    const adminSupabase = createAdminServer();

    // ✅ Check user permissions via unified auth
    const user = await getUnifiedUser();
    let isAdmin = false;
    
    if (user) {
      // Get item's org_id first
      const { data: itemOrg } = await adminSupabase
        .from('app_items')
        .select('org_id')
        .eq('id', itemId)
        .maybeSingle();
      
      if (itemOrg) {
        const { data: membership } = await adminSupabase
          .from('memberships')
          .select('role')
          .eq('org_id', itemOrg.org_id)
          .eq('user_id', user.id)
          .maybeSingle();
        
        isAdmin = !!(membership && (membership.role === 'owner' || membership.role === 'admin'));
      }
    }

    // Fetch item - with status filtering based on permissions
    let itemQuery = adminSupabase
      .from('app_items')
      .select(`
        id,
        collection_id,
        data,
        images,
        files,
        location_lat,
        location_lon,
        location_address,
        status,
        creator_id,
        org_id,
        moderated_by,
        moderated_at,
        moderation_note,
        views_count,
        reactions_count,
        created_at,
        updated_at,
        expires_at
      `)
      .eq('id', itemId);
    
    const { data: item, error: itemError } = await itemQuery.single();

    if (itemError) {
      if (itemError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
      logger.error({ error: itemError, itemId }, 'Error fetching item');
      return NextResponse.json(
        { error: 'Failed to fetch item' },
        { status: 500 }
      );
    }

    // ✅ Check permissions: non-admins can only see published/active OR their own pending items
    if (!isAdmin && item.status === 'pending') {
      // If not authenticated, deny access to pending items
      if (!user) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
      
      // Check if user is the creator
      const { data: participant } = await adminSupabase
        .from('participants')
        .select('user_id')
        .eq('id', item.creator_id)
        .maybeSingle();
      
      // If not the creator, deny access
      if (!participant || participant.user_id !== user.id) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
    }

      // Fetch participant info using admin client (public data for display)
      if (item.creator_id && item.org_id) {
        try {
          logger.info({ 
            creator_id: item.creator_id, 
            org_id: item.org_id,
            itemId 
          }, 'Attempting to fetch participant');

          // ✅ After migration 111: creator_id is participant_id
          const { data: participant, error: participantError } = await adminSupabase
            .from('participants')
            .select('id, user_id, org_id, full_name, username, photo_url')
            .eq('id', item.creator_id) // ✅ Search by participant.id
            .eq('org_id', item.org_id)
            .single();

          if (participantError) {
            logger.error({ 
              error: participantError, 
              creator_id: item.creator_id,
              org_id: item.org_id 
            }, 'Participant query error');
          }

          if (participant) {
            (item as any).participant = participant;
            logger.info({ 
              participant: { 
                id: participant.id, 
                full_name: participant.full_name, 
                username: participant.username 
              } 
            }, 'Participant found and attached');
          } else {
            logger.warn({ 
              creator_id: item.creator_id,
              org_id: item.org_id 
            }, 'No participant found for this creator_id + org_id');
          }
        } catch (err) {
          logger.error({ 
            error: err,
            creator_id: item.creator_id,
            org_id: item.org_id 
          }, 'Exception while fetching participant');
          // Continue without participant data
        }
      } else {
        logger.warn({ 
          has_creator_id: !!item.creator_id,
          has_org_id: !!item.org_id,
          itemId 
        }, 'Missing creator_id or org_id for participant lookup');
      }

    // Increment views count (fire and forget - ignore errors)
    adminSupabase
      .from('app_items')
      .update({ views_count: (item.views_count || 0) + 1 })
      .eq('id', itemId);

    // Log analytics event (optional - fire and forget)
    try {
      // Use admin client for RPC call (bypasses RLS)
      await adminSupabase.rpc('log_app_event', {
        p_app_id: appId,
        p_event_type: 'item_viewed',
        p_user_id: user?.id || null,
        p_item_id: itemId,
        p_collection_id: item.collection_id,
        p_data: {}
      });
    } catch (err) {
      // Ignore errors - analytics shouldn't block requests
      logger.error({ error: err }, 'Error logging analytics event');
    }

    const duration = Date.now() - startTime;
    logger.info({ itemId, appId, duration }, 'Item fetched successfully');

    return NextResponse.json({ item });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      itemId,
      duration 
    }, 'Error in GET /api/apps/[appId]/items/[itemId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/apps/[appId]/items/[itemId] - Update item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; itemId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId, itemId } = await params;
  
  try {
    const adminSupabase = createAdminServer();
    const body = await request.json();
    const { 
      data, 
      images, 
      files,
      locationLat, 
      locationLon, 
      locationAddress,
      status 
    } = body;

    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get existing item
    const { data: existingItem, error: fetchError } = await adminSupabase
      .from('app_items')
      .select('creator_id, org_id, collection_id')
      .eq('id', itemId)
      .single();

    if (fetchError || !existingItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Check permissions
    const { data: membership, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingItem.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Only owner can edit data/images, admins/moderators can change status
    // ✅ creator_id stores participant_id, not user_id - need to lookup participant
    let isOwner = false;
    if (existingItem.creator_id) {
      const { data: participant } = await adminSupabase
        .from('participants')
        .select('user_id')
        .eq('id', existingItem.creator_id)
        .eq('org_id', existingItem.org_id)
        .maybeSingle();
      isOwner = !!(participant && participant.user_id === user.id);
    }
    const isModerator = ['owner', 'admin', 'moderator'].includes(membership.role);

    if (!isOwner && !isModerator) {
      return NextResponse.json(
        { error: 'You can only edit your own items' },
        { status: 403 }
      );
    }

    // Build update object
    const updates: any = {};
    
    if (isOwner) {
      if (data !== undefined) updates.data = data;
      if (images !== undefined) updates.images = images;
      if (files !== undefined) updates.files = files;
      if (locationLat !== undefined) updates.location_lat = locationLat;
      if (locationLon !== undefined) updates.location_lon = locationLon;
      if (locationAddress !== undefined) updates.location_address = locationAddress;
    }

    if (isModerator && status !== undefined) {
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update item
    const { data: item, error: updateError } = await adminSupabase
      .from('app_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();

    if (updateError) {
      logger.error({ error: updateError, itemId }, 'Error updating item');
      return NextResponse.json(
        { error: 'Failed to update item' },
        { status: 500 }
      );
    }

    // Log analytics event
    try {
      await adminSupabase.rpc('log_app_event', {
        p_app_id: appId,
        p_event_type: 'item_updated',
        p_user_id: user.id,
        p_item_id: itemId,
        p_collection_id: existingItem.collection_id,
        p_data: { updates }
      });
    } catch (err) {
      logger.error({ error: err }, 'Error logging analytics event');
    }

    const duration = Date.now() - startTime;
    logger.info({ itemId, appId, updates, duration }, 'Item updated successfully');

    return NextResponse.json({ item });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      itemId,
      duration 
    }, 'Error in PATCH /api/apps/[appId]/items/[itemId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/apps/[appId]/items/[itemId] - Delete item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; itemId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId, itemId } = await params;
  
  try {
    const adminSupabase = createAdminServer();

    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get existing item
    const { data: existingItem, error: fetchError } = await adminSupabase
      .from('app_items')
      .select('creator_id, org_id, collection_id')
      .eq('id', itemId)
      .single();

    if (fetchError || !existingItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Check permissions (owner or admin)
    const { data: membership, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingItem.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // ✅ creator_id stores participant_id, not user_id - need to lookup participant
    let isOwner = false;
    if (existingItem.creator_id) {
      const { data: participant } = await adminSupabase
        .from('participants')
        .select('user_id')
        .eq('id', existingItem.creator_id)
        .eq('org_id', existingItem.org_id)
        .maybeSingle();
      isOwner = !!(participant && participant.user_id === user.id);
    }
    const isAdmin = ['owner', 'admin'].includes(membership.role);

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'You can only delete your own items' },
        { status: 403 }
      );
    }

    // Delete analytics events first (to avoid foreign key constraint violation)
    try {
      await adminSupabase
        .from('app_analytics_events')
        .delete()
        .eq('item_id', itemId);
      logger.info({ itemId }, 'Analytics events deleted');
    } catch (err) {
      logger.warn({ error: err, itemId }, 'Error deleting analytics events (non-critical)');
    }

    // Delete item (CASCADE will delete reactions, comments)
    const { error: deleteError } = await adminSupabase
      .from('app_items')
      .delete()
      .eq('id', itemId);

    if (deleteError) {
      logger.error({ error: deleteError, itemId }, 'Error deleting item');
      return NextResponse.json(
        { error: 'Failed to delete item' },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logger.info({ itemId, appId, duration }, 'Item deleted successfully');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      itemId,
      duration 
    }, 'Error in DELETE /api/apps/[appId]/items/[itemId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

