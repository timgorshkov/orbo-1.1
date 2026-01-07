import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { requireOrgAccess } from '@/lib/orgGuard';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * GET /api/announcements/[id] - Получить детали анонса
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'announcements/[id]' });
  const { id } = await params;
  
  try {
    const supabase = createAdminServer();
    
    // Получаем анонс
    const { data: announcement, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }
    
    // Проверяем доступ к организации
    try {
      await requireOrgAccess(announcement.org_id);
    } catch (error) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Получаем информацию о целевых группах
    const { data: groups } = await supabase
      .from('org_telegram_groups')
      .select('id, telegram_groups(title, chat_id)')
      .in('id', announcement.target_groups);
    
    return NextResponse.json({ 
      announcement,
      groups: groups || []
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Error in GET /api/announcements/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/announcements/[id] - Редактировать анонс
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'announcements/[id]' });
  const { id } = await params;
  
  try {
    const supabase = createAdminServer();
    
    // Получаем текущий анонс
    const { data: existing, error: fetchError } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }
    
    // Проверяем, можно ли редактировать
    if (existing.status === 'sent') {
      return NextResponse.json({ error: 'Cannot edit sent announcement' }, { status: 400 });
    }
    
    // Проверяем доступ с правами админа
    try {
      await requireOrgAccess(existing.org_id, ['owner', 'admin']);
    } catch (error) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const body = await request.json();
    const { title, content, target_groups, scheduled_at, status } = body;
    
    const user = await getUnifiedUser();
    
    // Получаем имя редактора
    let updatedByName = existing.updated_by_name;
    let updatedById: string | null = null;
    
    if (user) {
      updatedById = user.id;
      const { data: participant } = await supabase
        .from('participants')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (participant) {
        updatedByName = [participant.first_name, participant.last_name]
          .filter(Boolean)
          .join(' ') || user.email || 'Неизвестный';
      } else {
        updatedByName = user.email || 'Неизвестный';
      }
    }
    
    // Формируем объект обновления
    const updateData: Record<string, any> = {
      updated_by_id: updatedById,
      updated_by_name: updatedByName
    };
    
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (target_groups !== undefined) updateData.target_groups = target_groups;
    if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at;
    if (status !== undefined && ['scheduled', 'cancelled'].includes(status)) {
      updateData.status = status;
    }
    
    const { data: announcement, error } = await supabase
      .from('announcements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to update announcement');
      return NextResponse.json({ error: 'Failed to update announcement' }, { status: 500 });
    }
    
    logger.info({ announcementId: id, updatedBy: updatedByName }, 'Announcement updated');
    
    return NextResponse.json({ announcement });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Error in PATCH /api/announcements/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/announcements/[id] - Удалить анонс
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'announcements/[id]' });
  const { id } = await params;
  
  try {
    const supabase = createAdminServer();
    
    // Получаем текущий анонс
    const { data: existing, error: fetchError } = await supabase
      .from('announcements')
      .select('org_id, status')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }
    
    // Проверяем, можно ли удалить
    if (existing.status === 'sent') {
      return NextResponse.json({ error: 'Cannot delete sent announcement' }, { status: 400 });
    }
    
    // Проверяем доступ с правами админа
    try {
      await requireOrgAccess(existing.org_id, ['owner', 'admin']);
    } catch (error) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to delete announcement');
      return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 });
    }
    
    logger.info({ announcementId: id }, 'Announcement deleted');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Error in DELETE /api/announcements/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

