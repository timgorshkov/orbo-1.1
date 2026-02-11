import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createCronLogger } from '@/lib/logger';
import { sendAnnouncementToGroups } from '@/lib/services/announcementService';

const logger = createCronLogger('send-announcements');

/**
 * POST /api/cron/send-announcements
 * Отправляет запланированные анонсы, время которых наступило
 * Запускается каждую минуту
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  // Проверяем CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const supabase = createAdminServer();
    
    // Reset stuck "sending" announcements older than 5 minutes back to "scheduled"
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stuckAnnouncements } = await supabase
      .from('announcements')
      .update({ status: 'scheduled' })
      .eq('status', 'sending')
      .lt('updated_at', fiveMinutesAgo)
      .select('id');
    
    if (stuckAnnouncements && stuckAnnouncements.length > 0) {
      logger.info({ 
        count: stuckAnnouncements.length, 
        ids: stuckAnnouncements.map(a => a.id) 
      }, '🔄 Reset stuck "sending" announcements back to scheduled');
    }
    
    // Получаем анонсы, которые нужно отправить
    const { data: pendingAnnouncements, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10); // Ограничиваем чтобы не перегрузить
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch pending announcements');
      return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
    }
    
    if (!pendingAnnouncements || pendingAnnouncements.length === 0) {
      return NextResponse.json({ 
        message: 'No pending announcements',
        processed: 0
      });
    }
    
    logger.info({ count: pendingAnnouncements.length }, 'Processing pending announcements');
    
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;
    
    // Обрабатываем каждый анонс
    for (const announcement of pendingAnnouncements) {
      try {
        const result = await sendAnnouncementToGroups(announcement);
        processedCount++;
        
        if (result.successCount > 0) {
          successCount++;
        }
        if (result.failCount > 0 && result.successCount === 0) {
          failCount++;
        }
        
        // Небольшая задержка между анонсами
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        failCount++;
        logger.error({ 
          announcementId: announcement.id, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        }, 'Failed to process announcement');
      }
    }
    
    const duration = Date.now() - startTime;
    
    logger.info({ 
      processed: processedCount,
      success: successCount,
      failed: failCount,
      duration_ms: duration
    }, '✅ Announcements cron completed');
    
    return NextResponse.json({ 
      message: 'Announcements processed',
      processed: processedCount,
      success: successCount,
      failed: failCount,
      duration_ms: duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: duration
    }, 'Announcements cron failed');
    
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// Также поддерживаем GET для ручного запуска через браузер (с секретом в query)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Перенаправляем на POST обработчик
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${secret}`);
  
  const postRequest = new NextRequest(request.url, {
    method: 'POST',
    headers
  });
  
  return POST(postRequest);
}

