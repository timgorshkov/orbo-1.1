import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/logAdminAction';

// GET /api/apps/[appId] - Get app details (PUBLIC - no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  
  try {
    // Use admin client for public read access (no RLS restrictions)
    const adminSupabase = createAdminServer();

    // Fetch app - public read access
    const { data: app, error: appError } = await adminSupabase
      .from('apps')
      .select(`
        id,
        org_id,
        name,
        description,
        icon,
        app_type,
        config,
        status,
        visibility,
        created_by,
        created_at,
        updated_at
      `)
      .eq('id', appId)
      .single();

    if (appError) {
      if (appError.code === 'PGRST116') {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }
      logger.error({ error: appError, appId }, 'Error fetching app');
      return NextResponse.json(
        { error: 'Failed to fetch app' },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logger.info({ appId, duration }, 'App fetched successfully');

    return NextResponse.json({ app });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in GET /api/apps/[appId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/apps/[appId] - Update app (admins only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  
  try {
    const supabase = await createClientServer();
    const body = await request.json();
    const { name, description, icon, config, status, visibility } = body;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client for reading (after auth check)
    const adminSupabase = createAdminServer();

    // Get app to check org_id
    const { data: existingApp, error: fetchError } = await adminSupabase
      .from('apps')
      .select('org_id')
      .eq('id', appId)
      .single();

    if (fetchError || !existingApp) {
      logger.error({ error: fetchError, appId }, 'App not found for update');
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Check admin/owner role
    const { data: membership, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingApp.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      logger.error({ error: membershipError, userId: user.id, orgId: existingApp.org_id }, 'Membership not found for update');
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can update apps' },
        { status: 403 }
      );
    }

    // Build update object
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;
    if (config !== undefined) updates.config = config;
    if (status !== undefined) updates.status = status;
    if (visibility !== undefined) updates.visibility = visibility;

    // Update app using admin client
    const { data: app, error: updateError } = await adminSupabase
      .from('apps')
      .update(updates)
      .eq('id', appId)
      .select()
      .single();

    if (updateError) {
      logger.error({ error: updateError, appId }, 'Error updating app');
      return NextResponse.json(
        { error: 'Failed to update app' },
        { status: 500 }
      );
    }

    // Log admin action
    await logAdminAction({
      userId: user.id,
      orgId: app.org_id,
      action: 'app_updated',
      resourceType: 'app',
      resourceId: appId,
      metadata: { updates }
    });

    const duration = Date.now() - startTime;
    logger.info({ appId, updates, duration }, 'App updated successfully');

    return NextResponse.json({ app });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in PATCH /api/apps/[appId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/apps/[appId] - Delete app (owners only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  
  try {
    const supabase = await createClientServer();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client for reading (after auth check)
    const adminSupabase = createAdminServer();

    // Get app to check org_id
    const { data: existingApp, error: fetchError } = await adminSupabase
      .from('apps')
      .select('org_id, name')
      .eq('id', appId)
      .single();

    if (fetchError || !existingApp) {
      logger.error({ error: fetchError, appId }, 'App not found for deletion');
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Check owner role (only owners can delete)
    const { data: membership, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingApp.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      logger.error({ error: membershipError, userId: user.id, orgId: existingApp.org_id }, 'Membership not found');
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owners can delete apps' },
        { status: 403 }
      );
    }

    // Delete AI requests for this app
    const { error: aiRequestsDeleteError } = await adminSupabase
      .from('ai_requests')
      .delete()
      .eq('app_id', appId);
    
    if (aiRequestsDeleteError) {
      logger.error({ error: aiRequestsDeleteError, appId }, 'Error deleting AI requests');
    }

    // Check if app has any items and delete them first
    const { data: collections } = await adminSupabase
      .from('app_collections')
      .select('id')
      .eq('app_id', appId);

    if (collections && collections.length > 0) {
      const collectionIds = collections.map(c => c.id);
      
      // Get all item IDs
      const { data: itemsList } = await adminSupabase
        .from('app_items')
        .select('id')
        .in('collection_id', collectionIds);
      
      if (itemsList && itemsList.length > 0) {
        const itemIds = itemsList.map(item => item.id);
        
        // Delete analytics events first (they reference items)
        const { error: analyticsDeleteError } = await adminSupabase
          .from('app_analytics_events')
          .delete()
          .in('item_id', itemIds);
        
        if (analyticsDeleteError) {
          logger.error({ error: analyticsDeleteError, appId }, 'Error deleting analytics events');
        }
      }
      
      // Delete all items
      const { error: itemsDeleteError } = await adminSupabase
        .from('app_items')
        .delete()
        .in('collection_id', collectionIds);
      
      if (itemsDeleteError) {
        logger.error({ error: itemsDeleteError, appId }, 'Error deleting app items');
        return NextResponse.json(
          { error: 'Не удалось удалить объекты приложения' },
          { status: 500 }
        );
      }

      // Delete all collections
      const { error: collectionsDeleteError } = await adminSupabase
        .from('app_collections')
        .delete()
        .eq('app_id', appId);
      
      if (collectionsDeleteError) {
        logger.error({ error: collectionsDeleteError, appId }, 'Error deleting app collections');
        return NextResponse.json(
          { error: 'Не удалось удалить коллекции приложения' },
          { status: 500 }
        );
      }
    }

    // Delete app
    const { error: deleteError } = await adminSupabase
      .from('apps')
      .delete()
      .eq('id', appId);

    if (deleteError) {
      logger.error({ error: deleteError, appId }, 'Error deleting app');
      return NextResponse.json(
        { error: 'Failed to delete app' },
        { status: 500 }
      );
    }

    // Log admin action
    await logAdminAction({
      userId: user.id,
      orgId: existingApp.org_id,
      action: 'app_deleted',
      resourceType: 'app',
      resourceId: appId,
      metadata: { appName: existingApp.name }
    });

    const duration = Date.now() - startTime;
    logger.info({ appId, duration }, 'App deleted successfully');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in DELETE /api/apps/[appId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

