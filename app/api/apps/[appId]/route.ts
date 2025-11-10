import { createClientServer } from '@/lib/server/supabaseServer';
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
    const supabase = await createClientServer();

    // Fetch app - public read access
    const { data: app, error: appError } = await supabase
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
    const { name, description, icon, config, status } = body;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get app to check org_id
    const { data: existingApp, error: fetchError } = await supabase
      .from('apps')
      .select('org_id')
      .eq('id', appId)
      .single();

    if (fetchError || !existingApp) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Check admin/owner role
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingApp.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
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

    // Update app
    const { data: app, error: updateError } = await supabase
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

    // Get app to check org_id
    const { data: existingApp, error: fetchError } = await supabase
      .from('apps')
      .select('org_id, name')
      .eq('id', appId)
      .single();

    if (fetchError || !existingApp) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Check owner role (only owners can delete)
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingApp.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owners can delete apps' },
        { status: 403 }
      );
    }

    // Delete app (CASCADE will delete collections, items, etc)
    const { error: deleteError } = await supabase
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

