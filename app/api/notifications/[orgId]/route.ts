import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * GET /api/notifications/[orgId]
 * Получение уведомлений для организации (unified: notification_logs + attention_zone_items)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/notifications/[orgId]' });
  
  try {
    const { orgId } = await params;
    const adminSupabase = createAdminServer();
    
    // Проверка авторизации via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Проверка доступа к организации (owner/admin, с фолбэком на суперадмина)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId);
    
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Параметры запроса
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const includeResolved = url.searchParams.get('includeResolved') !== 'false';
    const hoursBack = parseInt(url.searchParams.get('hoursBack') || '168'); // 7 days
    const type = url.searchParams.get('type'); // filter by type
    
    // Получаем уведомления через RPC функцию
    const { data: notifications, error } = await adminSupabase.rpc('get_org_notifications', {
      p_org_id: orgId,
      p_limit: limit,
      p_include_resolved: includeResolved,
      p_hours_back: hoursBack,
    });
    
    if (error) {
      logger.error({ error: error.message, org_id: orgId }, 'Error fetching notifications');
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
    
    // Фильтр по типу если указан
    let filteredNotifications = notifications || [];
    if (type) {
      filteredNotifications = filteredNotifications.filter((n: any) => n.notification_type === type);
    }
    
    // Разделяем на активные и решённые
    const active = filteredNotifications.filter((n: any) => !n.resolved_at);
    const resolved = filteredNotifications.filter((n: any) => !!n.resolved_at);
    
    // Статистика
    const stats = {
      total: filteredNotifications.length,
      active: active.length,
      resolved: resolved.length,
      byType: {} as Record<string, number>,
    };
    
    filteredNotifications.forEach((n: any) => {
      if (!n.resolved_at) {
        stats.byType[n.notification_type] = (stats.byType[n.notification_type] || 0) + 1;
      }
    });
    
    logger.info({ 
      org_id: orgId, 
      active_count: active.length, 
      resolved_count: resolved.length 
    }, 'Notifications fetched');
    
    return NextResponse.json({
      notifications: [...active, ...resolved],
      stats,
    });
    
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching notifications');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

