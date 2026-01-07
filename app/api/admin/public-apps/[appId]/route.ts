import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * Проверка прав superadmin
 */
async function verifySuperadmin() {
  const user = await getUnifiedUser();
  
  if (!user) {
    return { authorized: false, error: 'Unauthorized' };
  }
  
  const adminSupabase = createAdminServer();
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('raw_user_meta_data')
    .eq('id', user.id)
    .single();
  
  const isSuperadmin = profile?.raw_user_meta_data?.is_superadmin === true ||
                       profile?.raw_user_meta_data?.is_superadmin === 'true';
  
  if (!isSuperadmin) {
    return { authorized: false, error: 'Forbidden: superadmin access required' };
  }
  
  return { authorized: true, userId: user.id };
}

/**
 * GET /api/admin/public-apps/[appId] - Получить детали приложения (superadmin)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = await params;
  
  try {
    const auth = await verifySuperadmin();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }
    
    const adminSupabase = createAdminServer();
    
    const { data: app, error } = await adminSupabase
      .from('public_apps')
      .select('*')
      .eq('id', appId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }
      logger.error({ error: error.message, appId }, 'Failed to fetch public app');
      return NextResponse.json({ error: 'Failed to fetch app' }, { status: 500 });
    }
    
    // Получаем статистику подключений
    const { data: stats } = await adminSupabase
      .rpc('get_public_app_stats', { p_app_id: appId });
    
    const duration = Date.now() - startTime;
    logger.info({ appId, duration }, 'Public app fetched (admin)');
    
    return NextResponse.json({ 
      app,
      stats: stats?.[0] || { total_connections: 0, active_connections: 0, total_groups: 0 }
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, appId, duration }, 'Error in GET /api/admin/public-apps/[appId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/public-apps/[appId] - Обновить приложение (superadmin)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = await params;
  
  try {
    const auth = await verifySuperadmin();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }
    
    const body = await request.json();
    const adminSupabase = createAdminServer();
    
    // Проверяем уникальность slug если он меняется
    if (body.slug) {
      const { data: existing } = await adminSupabase
        .from('public_apps')
        .select('id')
        .eq('slug', body.slug)
        .neq('id', appId)
        .single();
      
      if (existing) {
        return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
      }
    }
    
    // Обновляем приложение
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    // Копируем только разрешённые поля
    const allowedFields = [
      'name', 'slug', 'short_description', 'full_description',
      'icon_url', 'banner_url', 'screenshots',
      'bot_username', 'miniapp_url', 'bot_deep_link_template',
      'setup_instructions', 'features',
      'category', 'tags',
      'partner_name', 'partner_website', 'partner_contact',
      'status', 'featured', 'sort_order', 'config'
    ];
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }
    
    const { data: app, error } = await adminSupabase
      .from('public_apps')
      .update(updateData)
      .eq('id', appId)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }
      logger.error({ error: error.message, appId }, 'Failed to update public app');
      return NextResponse.json({ error: 'Failed to update app' }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      appId, 
      updatedFields: Object.keys(updateData).filter(k => k !== 'updated_at'),
      userId: auth.userId,
      duration 
    }, 'Public app updated');
    
    return NextResponse.json({ app });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, appId, duration }, 'Error in PATCH /api/admin/public-apps/[appId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/public-apps/[appId] - Удалить приложение (superadmin)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = await params;
  
  try {
    const auth = await verifySuperadmin();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Мягкое удаление - ставим статус deprecated
    const { error } = await adminSupabase
      .from('public_apps')
      .update({ 
        status: 'deprecated',
        updated_at: new Date().toISOString()
      })
      .eq('id', appId);
    
    if (error) {
      logger.error({ error: error.message, appId }, 'Failed to delete public app');
      return NextResponse.json({ error: 'Failed to delete app' }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    logger.info({ appId, userId: auth.userId, duration }, 'Public app deleted (deprecated)');
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, appId, duration }, 'Error in DELETE /api/admin/public-apps/[appId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

