import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';

/**
 * GET /api/apps/catalog/[appId] - Получить детали приложения из каталога
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = await params;
  
  try {
    const adminSupabase = createAdminServer();
    
    // Можно искать по id или по slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId);
    
    let query = adminSupabase
      .from('public_apps')
      .select(`
        id,
        name,
        slug,
        short_description,
        full_description,
        icon_url,
        banner_url,
        screenshots,
        bot_username,
        miniapp_url,
        bot_deep_link_template,
        setup_instructions,
        features,
        category,
        tags,
        partner_name,
        partner_website,
        featured,
        created_at
      `)
      .eq('status', 'active');
    
    if (isUUID) {
      query = query.eq('id', appId);
    } else {
      query = query.eq('slug', appId);
    }
    
    const { data: app, error } = await query.single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }
      logger.error({ error: error.message, appId }, 'Failed to fetch catalog app');
      return NextResponse.json({ error: 'Failed to fetch app' }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    logger.info({ appId, appName: app.name, duration }, 'Catalog app fetched');
    
    return NextResponse.json({ app });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in GET /api/apps/catalog/[appId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

