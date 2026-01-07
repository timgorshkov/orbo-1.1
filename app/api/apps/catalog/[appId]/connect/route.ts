import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { requireOrgAccess } from '@/lib/orgGuard';

/**
 * POST /api/apps/catalog/[appId]/connect - Подключить приложение к организации
 * 
 * Body: { orgId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = await params;
  
  try {
    const body = await request.json();
    const { orgId } = body;
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }
    
    // Проверка прав (только owner/admin могут подключать приложения)
    let user;
    try {
      const access = await requireOrgAccess(orgId, ['owner', 'admin']);
      user = access.user;
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Проверяем, что приложение существует и активно
    const { data: app, error: appError } = await adminSupabase
      .from('public_apps')
      .select('id, name, slug')
      .eq('id', appId)
      .eq('status', 'active')
      .single();
    
    if (appError || !app) {
      return NextResponse.json({ error: 'App not found or inactive' }, { status: 404 });
    }
    
    // Создаём или обновляем подключение (upsert)
    const { data: connection, error: connectError } = await adminSupabase
      .from('public_app_connections')
      .upsert({
        public_app_id: appId,
        org_id: orgId,
        connected_by: user.id,
        status: 'active',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'public_app_id,org_id'
      })
      .select()
      .single();
    
    if (connectError) {
      logger.error({ 
        error: connectError.message, 
        appId, 
        orgId 
      }, 'Failed to connect app');
      return NextResponse.json({ error: 'Failed to connect app' }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      appId, 
      appName: app.name,
      orgId, 
      userId: user.id,
      connectionId: connection.id,
      duration 
    }, 'App connected to organization');
    
    return NextResponse.json({ 
      connection,
      app: { id: app.id, name: app.name, slug: app.slug }
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in POST /api/apps/catalog/[appId]/connect');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/apps/catalog/[appId]/connect - Отключить приложение от организации
 * 
 * Body: { orgId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = await params;
  
  try {
    const body = await request.json();
    const { orgId } = body;
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }
    
    // Проверка прав
    try {
      await requireOrgAccess(orgId, ['owner', 'admin']);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Обновляем статус на disconnected (мягкое удаление)
    const { error: disconnectError } = await adminSupabase
      .from('public_app_connections')
      .update({ 
        status: 'disconnected',
        updated_at: new Date().toISOString()
      })
      .eq('public_app_id', appId)
      .eq('org_id', orgId);
    
    if (disconnectError) {
      logger.error({ 
        error: disconnectError.message, 
        appId, 
        orgId 
      }, 'Failed to disconnect app');
      return NextResponse.json({ error: 'Failed to disconnect app' }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    logger.info({ appId, orgId, duration }, 'App disconnected from organization');
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in DELETE /api/apps/catalog/[appId]/connect');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

