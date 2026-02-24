import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { requireOrgAccess } from '@/lib/orgGuard';
import { sendAnnouncementToGroups } from '@/lib/services/announcementService';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

/**
 * POST /api/announcements/[id]/send - Отправить анонс немедленно
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'announcements/[id]/send' });
  const { id } = await params;
  
  try {
    const supabase = createAdminServer();
    
    // Получаем анонс
    const { data: announcement, error: fetchError } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }
    
    // Проверяем статус
    if (announcement.status === 'sent') {
      return NextResponse.json({ error: 'Announcement already sent' }, { status: 400 });
    }
    
    if (announcement.status === 'sending') {
      return NextResponse.json({ error: 'Announcement is being sent' }, { status: 400 });
    }
    
    // Проверяем доступ с правами админа
    try {
      await requireOrgAccess(announcement.org_id, ['owner', 'admin']);
    } catch (error) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const user = await getUnifiedUser();
    
    // Отправляем
    const result = await sendAnnouncementToGroups(announcement);
    
    logger.info({ 
      announcementId: id, 
      successCount: result.successCount,
      failCount: result.failCount
    }, 'Announcement sent');
    
    if (user) {
      logAdminAction({
        orgId: announcement.org_id,
        userId: user.id,
        action: AdminActions.SEND_ANNOUNCEMENT,
        resourceType: ResourceTypes.ANNOUNCEMENT,
        resourceId: id,
        metadata: {
          title: announcement.title,
          success_count: result.successCount,
          fail_count: result.failCount,
        },
      }).catch(() => {});
    }
    
    return NextResponse.json({ 
      success: true,
      result
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Error in POST /api/announcements/[id]/send');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

