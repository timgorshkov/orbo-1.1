import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/logAdminAction';
import { validateAppConfig, logAIRequest } from '@/lib/services/aiConstructorService';

const logger = createAPILogger;

// POST /api/ai/generate-app - Create app from AI-generated config
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const log = logger(request);
  
  try {
    const supabase = await createClientServer();
    const supabaseAdmin = createAdminServer();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { appConfig, orgId, conversationId } = body;

    if (!appConfig || !orgId) {
      return NextResponse.json(
        { error: 'appConfig and orgId are required' },
        { status: 400 }
      );
    }

    // Validate config
    const validation = validateAppConfig(appConfig);
    if (!validation.valid) {
      log.error({
        userId: user.id,
        orgId,
        errors: validation.errors,
      }, 'Invalid app config');
      
      return NextResponse.json(
        { error: 'Invalid app configuration', details: validation.errors },
        { status: 400 }
      );
    }

    // Check membership and permissions (admin or owner)
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
    const { data: app, error: appError } = await supabaseAdmin
      .from('apps')
      .insert({
        org_id: orgId,
        name: appConfig.app.name,
        description: appConfig.app.description,
        icon: appConfig.app.icon || '📦',
        app_type: appConfig.app.app_type || 'custom',
        config: appConfig.app.config || {},
        status: 'active',
        created_by: user.id,
      })
      .select()
      .single();

    if (appError) {
      log.error({
        error: appError,
        userId: user.id,
        orgId,
      }, 'Failed to create app');
      
      return NextResponse.json(
        { error: 'Failed to create app' },
        { status: 500 }
      );
    }

    // Create collections
    const collections = appConfig.collections || [];
    const createdCollections = [];

    for (const collectionConfig of collections) {
      const { data: collection, error: collectionError } = await supabaseAdmin
        .from('app_collections')
        .insert({
          app_id: app.id,
          name: collectionConfig.name,
          display_name: collectionConfig.display_name,
          icon: collectionConfig.icon || '📋',
          schema: collectionConfig.schema,
          permissions: collectionConfig.permissions,
          workflows: collectionConfig.workflows,
          views: collectionConfig.views || ['list'],
          moderation_enabled: collectionConfig.moderation_enabled || false,
        })
        .select()
        .single();

      if (collectionError) {
        log.error({
          error: collectionError,
          appId: app.id,
          collectionName: collectionConfig.name,
        }, 'Failed to create collection');
        
        // Rollback: delete app
        await supabaseAdmin.from('apps').delete().eq('id', app.id);
        
        return NextResponse.json(
          { error: 'Failed to create collection' },
          { status: 500 }
        );
      }

      createdCollections.push(collection);
    }

    // Log admin action
    await logAdminAction({
      userId: user.id,
      orgId,
      action: 'app_created_via_ai',
      resourceType: 'app',
      resourceId: app.id,
      metadata: {
        appName: app.name,
        appType: app.app_type,
        collectionCount: createdCollections.length,
        fieldCount: collections.reduce((sum: number, c: any) => sum + (c.schema?.fields?.length || 0), 0),
        generatedByAI: true,
      },
    });

    // Mark AI requests as applied (if conversationId provided)
    if (conversationId) {
      await supabaseAdmin
        .from('ai_requests')
        .update({ was_applied: true, app_id: app.id })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
    }

    const duration = Date.now() - startTime;
    log.info({
      userId: user.id,
      orgId,
      appId: app.id,
      collectionCount: createdCollections.length,
      duration,
    }, 'App created successfully via AI');

    return NextResponse.json({
      success: true,
      app: {
        id: app.id,
        name: app.name,
        description: app.description,
        icon: app.icon,
      },
      collections: createdCollections.map(c => ({
        id: c.id,
        name: c.name,
        display_name: c.display_name,
      })),
    }, { status: 201 });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log.error({
      error: error.message,
      duration,
    }, 'Error in POST /api/ai/generate-app');
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

