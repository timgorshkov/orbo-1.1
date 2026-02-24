import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { requireOrgAccess } from '@/lib/orgGuard';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

/**
 * GET /api/announcements - Получить список анонсов организации
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'announcements' });
  
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const status = searchParams.get('status'); // scheduled, sent, all
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const eventId = searchParams.get('event_id');
    
    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }
    
    // Проверяем доступ к организации
    try {
      await requireOrgAccess(orgId);
    } catch (error) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    const supabase = createAdminServer();
    
    let query = supabase
      .from('announcements')
      .select('*')
      .eq('org_id', orgId)
      .order('scheduled_at', { ascending: true });
    
    // Фильтр по статусу
    if (status && status !== 'all') {
      if (status === 'upcoming') {
        query = query.in('status', ['scheduled', 'sending']);
      } else if (status === 'sent') {
        query = query.eq('status', 'sent');
      } else {
        query = query.eq('status', status);
      }
    }
    
    // Фильтр по дате
    if (from) {
      query = query.gte('scheduled_at', from);
    }
    if (to) {
      query = query.lte('scheduled_at', to);
    }
    
    // Фильтр по событию
    if (eventId) {
      query = query.eq('event_id', eventId);
    }
    
    const { data: announcements, error } = await query;
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch announcements');
      return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      announcements: announcements || [],
      count: announcements?.length || 0 
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Error in GET /api/announcements');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/announcements - Создать новый анонс
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'announcements' });
  
  try {
    const body = await request.json();
    const { 
      org_id, 
      title, 
      content, 
      target_groups, 
      scheduled_at,
      event_id,
      reminder_type
    } = body;
    
    // Валидация
    if (!org_id || !title || !content || !scheduled_at) {
      return NextResponse.json({ 
        error: 'org_id, title, content, and scheduled_at are required' 
      }, { status: 400 });
    }
    
    if (!target_groups || !Array.isArray(target_groups) || target_groups.length === 0) {
      return NextResponse.json({ 
        error: 'target_groups must be a non-empty array' 
      }, { status: 400 });
    }
    
    // Проверяем доступ с правами админа
    try {
      await requireOrgAccess(org_id, ['owner', 'admin']);
    } catch (error) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const supabase = createAdminServer();
    const user = await getUnifiedUser();
    
    // Получаем имя пользователя
    let createdByName = 'автоматически';
    let createdById: string | null = null;
    
    if (user) {
      createdById = user.id;
      // Пробуем получить имя из participant или profile
      const { data: participant } = await supabase
        .from('participants')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (participant) {
        createdByName = [participant.first_name, participant.last_name]
          .filter(Boolean)
          .join(' ') || user.email || 'Неизвестный';
      } else {
        createdByName = user.email || 'Неизвестный';
      }
    }
    
    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert({
        org_id,
        title,
        content,
        target_groups,
        scheduled_at,
        event_id: event_id || null,
        reminder_type: reminder_type || null,
        created_by_id: createdById,
        created_by_name: createdByName,
        status: 'scheduled'
      })
      .select()
      .single();
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to create announcement');
      return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });
    }
    
    logger.info({ 
      announcementId: announcement.id,
      orgId: org_id,
      scheduledAt: scheduled_at,
      targetGroups: target_groups.length
    }, 'Announcement created');
    
    if (createdById) {
      logAdminAction({
        orgId: org_id,
        userId: createdById,
        action: AdminActions.CREATE_ANNOUNCEMENT,
        resourceType: ResourceTypes.ANNOUNCEMENT,
        resourceId: announcement.id,
        metadata: { title, target_groups_count: target_groups.length, scheduled_at },
      }).catch(() => {});
    }
    
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Error in POST /api/announcements');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

