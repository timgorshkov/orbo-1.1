import { createClientServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/logAdminAction';

// GET /api/apps - List apps for organization
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  
  try {
    const supabase = await createClientServer();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json(
        { error: 'orgId is required' },
        { status: 400 }
      );
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Fetch apps (RLS will handle authorization)
    const { data: apps, error: appsError } = await supabase
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
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (appsError) {
      logger.error({ error: appsError, orgId }, 'Error fetching apps');
      return NextResponse.json(
        { error: 'Failed to fetch apps' },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logger.info({
      orgId,
      count: apps?.length || 0,
      duration
    }, 'Apps fetched successfully');

    return NextResponse.json({ apps: apps || [] });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, duration }, 'Error in GET /api/apps');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/apps - Create new app (admins only)
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  
  try {
    const supabase = await createClientServer();
    const body = await request.json();
    const { orgId, name, description, icon, appType, config } = body;

    if (!orgId || !name) {
      return NextResponse.json(
        { error: 'orgId and name are required' },
        { status: 400 }
      );
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        { error: 'Only owners and admins can create apps' },
        { status: 403 }
      );
    }

    // Create app
    const { data: app, error: createError } = await supabase
      .from('apps')
      .insert({
        org_id: orgId,
        name,
        description: description || null,
        icon: icon || '📦',
        app_type: appType || 'custom',
        config: config || {},
        status: 'active',
        created_by: user.id
      })
      .select()
      .single();

    if (createError) {
      logger.error({ error: createError, orgId, name }, 'Error creating app');
      return NextResponse.json(
        { error: 'Failed to create app' },
        { status: 500 }
      );
    }

    // Log admin action
    await logAdminAction({
      userId: user.id,
      orgId,
      action: 'app_created',
      resourceType: 'app',
      resourceId: app.id,
      metadata: { appName: name, appType: appType || 'custom' }
    });

    const duration = Date.now() - startTime;
    logger.info({
      appId: app.id,
      orgId,
      name,
      duration
    }, 'App created successfully');

    return NextResponse.json({ app }, { status: 201 });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, duration }, 'Error in POST /api/apps');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

