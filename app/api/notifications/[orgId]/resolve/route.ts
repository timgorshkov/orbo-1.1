import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * POST /api/notifications/[orgId]/resolve
 * Отметить уведомление как решённое
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/notifications/[orgId]/resolve' });
  
  try {
    const { orgId } = await params;
    const adminSupabase = createAdminServer();
    
    // Проверка авторизации via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Проверка доступа к организации (owner/admin)
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Получаем данные из тела запроса
    const body = await request.json();
    const { notificationId, sourceType } = body;
    
    if (!notificationId || !sourceType) {
      return NextResponse.json(
        { error: 'notificationId and sourceType are required' }, 
        { status: 400 }
      );
    }
    
    // Получаем имя пользователя для отображения
    let userName: string = 'Пользователь';
    
    // 1. Пробуем из UnifiedUser.name (из NextAuth или Supabase)
    if (user.name) {
      userName = user.name;
    } else if (user.raw?.supabase?.user_metadata?.full_name) {
      // 2. Пробуем из raw Supabase user_metadata
      userName = user.raw.supabase.user_metadata.full_name;
    } else if (user.raw?.supabase?.user_metadata?.name) {
      userName = user.raw.supabase.user_metadata.name;
    } else {
      // 3. Пробуем через RPC функцию
      try {
        const { data: displayName } = await adminSupabase
          .rpc('get_user_display_name', { p_user_id: user.id });
        if (displayName) {
          userName = displayName;
        }
      } catch {
        // RPC не существует - используем email
        if (user.email) {
          userName = user.email.split('@')[0];
        }
      }
    }
    
    // Вызываем соответствующую функцию в зависимости от типа источника
    let success = false;
    
    if (sourceType === 'notification_rule') {
      // Резолюция notification_log
      const { data } = await adminSupabase.rpc('resolve_notification', {
        p_notification_id: notificationId,
        p_user_id: user.id,
        p_user_name: userName,
      });
      success = data === true;
    } else if (sourceType === 'attention_zone') {
      // Резолюция attention_zone_item
      const { data } = await adminSupabase.rpc('resolve_attention_item', {
        p_item_id: notificationId,
        p_user_id: user.id,
        p_user_name: userName,
      });
      success = data === true;
    } else {
      return NextResponse.json({ error: 'Invalid sourceType' }, { status: 400 });
    }
    
    if (!success) {
      logger.warn({ 
        notification_id: notificationId, 
        source_type: sourceType 
      }, 'Notification not found or already resolved');
      return NextResponse.json({ error: 'Not found or already resolved' }, { status: 404 });
    }
    
    logger.info({ 
      notification_id: notificationId, 
      source_type: sourceType,
      resolved_by: user.id,
      resolved_by_name: userName 
    }, '✅ Notification resolved');
    
    return NextResponse.json({ 
      success: true,
      resolvedBy: userName,
      resolvedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.error({ error }, 'Error resolving notification');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

