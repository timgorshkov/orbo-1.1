import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import { TelegramService } from '@/lib/services/telegramService';

const logger = createServiceLogger('AnnouncementService');

interface Announcement {
  id: string;
  org_id: string;
  title: string;
  content: string;
  target_groups: string[];
  status: string;
}

interface SendResult {
  successCount: number;
  failCount: number;
  results: Record<string, { success: boolean; message_id?: number; error?: string }>;
}

/**
 * Отправляет анонс во все целевые группы
 */
export async function sendAnnouncementToGroups(announcement: Announcement): Promise<SendResult> {
  const supabase = createAdminServer();
  
  // Обновляем статус на "sending"
  await supabase
    .from('announcements')
    .update({ status: 'sending' })
    .eq('id', announcement.id);
  
  const results: Record<string, { success: boolean; message_id?: number; error?: string }> = {};
  let successCount = 0;
  let failCount = 0;
  
  try {
    // Получаем информацию о группах по tg_chat_id
    const { data: groups, error: groupsError } = await supabase
      .from('telegram_groups')
      .select('tg_chat_id, title')
      .in('tg_chat_id', announcement.target_groups);
    
    if (groupsError || !groups || groups.length === 0) {
      logger.warn({ announcementId: announcement.id }, 'No valid target groups found');
      
      await supabase
        .from('announcements')
        .update({ 
          status: 'failed',
          send_results: { error: 'No valid target groups' },
          sent_at: new Date().toISOString()
        })
        .eq('id', announcement.id);
      
      return { successCount: 0, failCount: announcement.target_groups.length, results };
    }
    
    // Инициализируем Telegram сервис
    const telegram = new TelegramService();
    
    // Отправляем в каждую группу
    for (const group of groups) {
      const chatId = group.tg_chat_id;
      const groupTitle = group.title || 'Unknown';
      
      if (!chatId) {
        results[String(group.tg_chat_id)] = { success: false, error: 'No chat_id' };
        failCount++;
        continue;
      }
      
      try {
        // Отправляем сообщение с Telegram Markdown
        const messageResult = await telegram.sendMessage(
          chatId,
          announcement.content,
          { parse_mode: 'Markdown' }
        );
        
        results[String(chatId)] = { 
          success: true, 
          message_id: messageResult.message_id 
        };
        successCount++;
        
        logger.debug({ 
          announcementId: announcement.id, 
          chatId,
          groupTitle,
          messageId: messageResult.message_id 
        }, 'Message sent to group');
        
        // Небольшая задержка между отправками чтобы не превысить лимиты API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results[String(chatId)] = { success: false, error: errorMessage };
        failCount++;
        
        logger.warn({ 
          announcementId: announcement.id, 
          chatId,
          groupTitle,
          error: errorMessage 
        }, 'Failed to send message to group');
      }
    }
    
    // Обновляем статус анонса
    const finalStatus = failCount === 0 ? 'sent' : (successCount === 0 ? 'failed' : 'sent');
    
    await supabase
      .from('announcements')
      .update({ 
        status: finalStatus,
        send_results: results,
        sent_at: new Date().toISOString()
      })
      .eq('id', announcement.id);
    
    logger.info({ 
      announcementId: announcement.id,
      successCount,
      failCount,
      status: finalStatus
    }, 'Announcement sending completed');
    
    return { successCount, failCount, results };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await supabase
      .from('announcements')
      .update({ 
        status: 'failed',
        send_results: { error: errorMessage },
        sent_at: new Date().toISOString()
      })
      .eq('id', announcement.id);
    
    logger.error({ announcementId: announcement.id, error: errorMessage }, 'Announcement sending failed');
    
    return { successCount, failCount, results };
  }
}

/**
 * Создаёт напоминания для события
 */
export async function createEventReminders(
  eventId: string,
  orgId: string,
  eventTitle: string,
  eventDescription: string | null,
  eventStartTime: Date,
  eventLocation: string | null,
  targetGroups: string[]
): Promise<void> {
  const supabase = createAdminServer();
  
  // Формируем текст напоминания
  let reminderContent = `🗓 *Напоминание: ${eventTitle}*\n\n`;
  reminderContent += `📅 ${formatDateTime(eventStartTime)}\n`;
  
  if (eventLocation) {
    reminderContent += `📍 ${eventLocation}\n`;
  }
  
  if (eventDescription) {
    reminderContent += `\n${eventDescription}`;
  }
  
  const now = new Date();
  const announcements: Array<{
    org_id: string;
    title: string;
    content: string;
    event_id: string;
    reminder_type: string;
    target_groups: string[];
    scheduled_at: string;
    created_by_name: string;
  }> = [];
  
  // Анонс за 24 часа
  const reminder24h = new Date(eventStartTime.getTime() - 24 * 60 * 60 * 1000);
  if (reminder24h > now) {
    announcements.push({
      org_id: orgId,
      title: `Напоминание за 24ч: ${eventTitle}`,
      content: reminderContent,
      event_id: eventId,
      reminder_type: '24h',
      target_groups: targetGroups,
      scheduled_at: reminder24h.toISOString(),
      created_by_name: 'автоматически'
    });
  }
  
  // Анонс за 1 час
  const reminder1h = new Date(eventStartTime.getTime() - 60 * 60 * 1000);
  if (reminder1h > now) {
    announcements.push({
      org_id: orgId,
      title: `Напоминание за 1ч: ${eventTitle}`,
      content: reminderContent,
      event_id: eventId,
      reminder_type: '1h',
      target_groups: targetGroups,
      scheduled_at: reminder1h.toISOString(),
      created_by_name: 'автоматически'
    });
  }
  
  if (announcements.length > 0) {
    const { error } = await supabase
      .from('announcements')
      .insert(announcements);
    
    if (error) {
      logger.error({ eventId, error: error.message }, 'Failed to create event reminders');
    } else {
      logger.info({ 
        eventId, 
        remindersCount: announcements.length,
        types: announcements.map(a => a.reminder_type)
      }, 'Event reminders created');
    }
  }
}

/**
 * Удаляет напоминания для события
 */
export async function deleteEventReminders(eventId: string): Promise<void> {
  const supabase = createAdminServer();
  
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('event_id', eventId)
    .in('status', ['scheduled', 'cancelled']);
  
  if (error) {
    logger.error({ eventId, error: error.message }, 'Failed to delete event reminders');
  } else {
    logger.info({ eventId }, 'Event reminders deleted');
  }
}

/**
 * Форматирует дату и время
 */
function formatDateTime(date: Date): string {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow'
  });
}

