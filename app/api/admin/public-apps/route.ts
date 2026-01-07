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
  
  // Проверяем is_superadmin в profiles
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
 * GET /api/admin/public-apps - Получить все приложения каталога (superadmin)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  
  try {
    const auth = await verifySuperadmin();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Получаем все приложения (включая draft)
    const { data: apps, error } = await adminSupabase
      .from('public_apps')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch public apps');
      return NextResponse.json({ error: 'Failed to fetch apps' }, { status: 500 });
    }
    
    // Получаем количество подключений
    const { data: connectionCounts } = await adminSupabase
      .from('public_app_connections')
      .select('public_app_id')
      .eq('status', 'active');
    
    const countsMap = new Map<string, number>();
    (connectionCounts || []).forEach((conn: any) => {
      const count = countsMap.get(conn.public_app_id) || 0;
      countsMap.set(conn.public_app_id, count + 1);
    });
    
    // Преобразуем count
    const appsWithStats = (apps || []).map(app => ({
      ...app,
      connections_count: countsMap.get(app.id) || 0
    }));
    
    const duration = Date.now() - startTime;
    logger.info({ 
      count: appsWithStats.length, 
      userId: auth.userId,
      duration 
    }, 'Public apps fetched (admin)');
    
    return NextResponse.json({ apps: appsWithStats });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, duration }, 'Error in GET /api/admin/public-apps');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/public-apps - Создать новое приложение в каталоге (superadmin)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  
  try {
    const auth = await verifySuperadmin();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }
    
    const body = await request.json();
    
    // Валидация обязательных полей
    if (!body.name || !body.slug || !body.bot_username) {
      return NextResponse.json({ 
        error: 'name, slug, and bot_username are required' 
      }, { status: 400 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Проверяем уникальность slug
    const { data: existing } = await adminSupabase
      .from('public_apps')
      .select('id')
      .eq('slug', body.slug)
      .single();
    
    if (existing) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }
    
    // Создаём приложение
    const { data: app, error } = await adminSupabase
      .from('public_apps')
      .insert({
        name: body.name,
        slug: body.slug,
        short_description: body.short_description,
        full_description: body.full_description,
        icon_url: body.icon_url,
        banner_url: body.banner_url,
        screenshots: body.screenshots || [],
        bot_username: body.bot_username,
        miniapp_url: body.miniapp_url,
        bot_deep_link_template: body.bot_deep_link_template,
        setup_instructions: body.setup_instructions,
        features: body.features || [],
        category: body.category || 'other',
        tags: body.tags || [],
        partner_name: body.partner_name,
        partner_website: body.partner_website,
        partner_contact: body.partner_contact,
        status: body.status || 'draft',
        featured: body.featured || false,
        sort_order: body.sort_order || 0
      })
      .select()
      .single();
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to create public app');
      return NextResponse.json({ error: 'Failed to create app' }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      appId: app.id, 
      appName: app.name,
      userId: auth.userId,
      duration 
    }, 'Public app created');
    
    return NextResponse.json({ app }, { status: 201 });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, duration }, 'Error in POST /api/admin/public-apps');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

