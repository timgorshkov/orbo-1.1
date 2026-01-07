import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { requireOrgAccess } from '@/lib/orgGuard';

/**
 * GET /api/apps/org/[orgId] - Получить все приложения организации
 * 
 * Возвращает единый список:
 * - Собственные приложения (созданные в конструкторе)
 * - Подключённые из каталога
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { orgId } = await params;
  
  try {
    // Проверка доступа к организации (любая роль)
    try {
      await requireOrgAccess(orgId);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Используем RPC функцию для объединённого списка
    const { data: apps, error } = await adminSupabase
      .rpc('get_org_all_apps', { p_org_id: orgId });
    
    if (error) {
      logger.error({ 
        error: error.message, 
        orgId 
      }, 'Failed to fetch org apps via RPC');
      
      // Fallback: получаем данные напрямую
      return await getAppsDirectly(adminSupabase, orgId, logger, startTime);
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      orgId, 
      count: apps?.length || 0,
      duration 
    }, 'Org apps fetched');
    
    return NextResponse.json({ 
      apps: apps || [],
      count: apps?.length || 0
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      orgId,
      duration 
    }, 'Error in GET /api/apps/org/[orgId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Fallback метод если RPC не работает
 */
async function getAppsDirectly(
  adminSupabase: ReturnType<typeof createAdminServer>,
  orgId: string,
  logger: ReturnType<typeof createAPILogger>,
  startTime: number
) {
  try {
    // Получаем собственные приложения
    const { data: ownApps, error: ownError } = await adminSupabase
      .from('apps')
      .select(`
        id,
        name,
        description,
        icon,
        status,
        created_at
      `)
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });
    
    if (ownError) {
      logger.error({ error: ownError.message }, 'Failed to fetch own apps');
    }
    
    // Получаем подключённые из каталога
    const { data: catalogConnections, error: catalogError } = await adminSupabase
      .from('public_app_connections')
      .select(`
        id,
        status,
        created_at,
        public_apps (
          id,
          name,
          short_description,
          icon_url,
          miniapp_url
        )
      `)
      .eq('org_id', orgId)
      .eq('status', 'active');
    
    if (catalogError) {
      logger.error({ error: catalogError.message }, 'Failed to fetch catalog connections');
    }
    
    // Объединяем в единый формат
    const apps = [
      // Собственные
      ...(ownApps || []).map(app => ({
        id: app.id,
        name: app.name,
        description: app.description,
        icon_url: app.icon,
        app_type: 'own' as const,
        source_id: app.id,
        miniapp_url: null,
        status: app.status,
        created_at: app.created_at
      })),
      // Из каталога
      ...(catalogConnections || []).map(conn => {
        const pa = conn.public_apps as any;
        return {
          id: conn.id,
          name: pa?.name || 'Unknown',
          description: pa?.short_description || '',
          icon_url: pa?.icon_url,
          app_type: 'catalog' as const,
          source_id: pa?.id,
          miniapp_url: pa?.miniapp_url,
          status: conn.status,
          created_at: conn.created_at
        };
      })
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    const duration = Date.now() - startTime;
    logger.info({ 
      orgId, 
      ownCount: ownApps?.length || 0,
      catalogCount: catalogConnections?.length || 0,
      totalCount: apps.length,
      duration,
      fallback: true
    }, 'Org apps fetched (fallback)');
    
    return NextResponse.json({ 
      apps,
      count: apps.length
    });
    
  } catch (error: any) {
    logger.error({ error: error.message }, 'Fallback fetch failed');
    return NextResponse.json({ error: 'Failed to fetch apps' }, { status: 500 });
  }
}

