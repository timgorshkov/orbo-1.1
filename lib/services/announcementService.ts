import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import { TelegramService } from '@/lib/services/telegramService';
import { createMaxService } from '@/lib/services/maxService';
import { verifyOrgGroupAccessBatch } from '@/lib/server/orgGroupAccess';

const logger = createServiceLogger('AnnouncementService');

interface Announcement {
  id: string;
  org_id: string;
  title: string;
  content: string;
  target_groups: string[];
  target_max_groups?: string[];
  target_topics?: Record<string, number>;  // { "<tg_chat_id>": topic_id }
  event_id?: string | null;
  status: string;
  image_url?: string | null;
  retry_count?: number;
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
  
  const hasMaxTargets = Array.isArray(announcement.target_max_groups) && announcement.target_max_groups.length > 0;

  try {
    // Получаем информацию о Telegram группах по tg_chat_id
    const hasTgTargets = announcement.target_groups && announcement.target_groups.length > 0;
    let groups: any[] = [];

    if (hasTgTargets) {
      const { data: tgGroups, error: groupsError } = await supabase
        .from('telegram_groups')
        .select('tg_chat_id, title')
        .in('tg_chat_id', announcement.target_groups);

      if (!groupsError && tgGroups) {
        groups = tgGroups;
      }
    }

    if (groups.length === 0 && !hasMaxTargets) {
      logger.warn({ announcementId: announcement.id }, 'No valid target groups found');

      await supabase
        .from('announcements')
        .update({
          status: 'failed',
          send_results: { error: 'No valid target groups' },
          sent_at: new Date().toISOString()
        })
        .eq('id', announcement.id);

      return { successCount: 0, failCount: (announcement.target_groups?.length || 0), results };
    }
    
    // ─── Send to Telegram groups ─────────────────────────
    if (groups.length > 0) {
    // Verify org admins still have Telegram admin rights in target groups
    const chatIds = groups.map(g => g.tg_chat_id).filter(Boolean)
    const accessibleGroups = await verifyOrgGroupAccessBatch(announcement.org_id, chatIds)

    if (accessibleGroups.size === 0) {
      logger.warn({
        announcementId: announcement.id, org_id: announcement.org_id,
        target_groups: chatIds,
      }, 'ACCESS REVOKED: No org admin has TG admin rights in any target group')
    }

    const telegram = new TelegramService();

    for (const group of groups) {
      const chatId = group.tg_chat_id;
      const groupTitle = group.title || 'Unknown';

      if (chatId && !accessibleGroups.has(String(chatId))) {
        results[String(chatId)] = { success: false, error: 'Access revoked: no org admin is TG group admin' }
        failCount++
        logger.warn({
          announcementId: announcement.id, chatId, groupTitle,
        }, 'Skipped group — org admin lost TG admin rights')
        continue
      }

      if (!chatId) {
        results[String(group.tg_chat_id)] = { success: false, error: 'No chat_id' };
        failCount++;
        continue;
      }

      // Resolve forum topic thread ID (if configured for this group)
      const topicId = announcement.target_topics?.[String(chatId)];
      const threadOptions = topicId ? { message_thread_id: topicId } : {};

      try {
        let messageResult: any;

        // Content is stored as Telegram-compatible HTML from the rich editor
        if (announcement.image_url) {
          messageResult = await telegram.sendPhoto(
            chatId,
            announcement.image_url,
            { caption: announcement.content, parse_mode: 'HTML', ...threadOptions }
          );
        } else {
          messageResult = await telegram.sendMessage(
            chatId,
            announcement.content,
            { parse_mode: 'HTML', ...threadOptions }
          );
        }

        // Fallback: if HTML parsing failed, retry without parse_mode (plain text)
        const isParseError = messageResult?.ok === false &&
          messageResult?.description?.includes("can't parse entities");

        if (isParseError) {
          logger.info({
            announcementId: announcement.id, chatId, groupTitle
          }, '⚠️ HTML parse error, retrying without parse_mode');

          if (announcement.image_url) {
            messageResult = await telegram.sendPhoto(
              chatId,
              announcement.image_url,
              { caption: announcement.content, parse_mode: undefined, ...threadOptions }
            );
          } else {
            messageResult = await telegram.sendMessage(
              chatId,
              announcement.content,
              { parse_mode: undefined, ...threadOptions }
            );
          }
        }
        
        // callApi returns { ok: false, ... } on error instead of throwing
        if (messageResult && messageResult.ok === false) {
          const errorDesc = messageResult.description || 'Unknown Telegram API error';
          results[String(chatId)] = { success: false, error: errorDesc };
          failCount++;
          
          logger.warn({ 
            announcementId: announcement.id, 
            chatId,
            groupTitle,
            error_code: messageResult.error_code,
            error: errorDesc
          }, 'Telegram API returned error for group');
        } else {
          results[String(chatId)] = { 
            success: true, 
            message_id: messageResult?.result?.message_id || messageResult?.message_id 
          };
          successCount++;
          
          logger.debug({ 
            announcementId: announcement.id, 
            chatId,
            groupTitle,
            messageId: messageResult?.result?.message_id || messageResult?.message_id 
          }, 'Message sent to group');
        }
        
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
    } // end if (groups.length > 0)

    // ─── Send to MAX groups if specified ─────────────────────
    // target_max_groups is JSONB — could be array of strings or numbers, or empty object {}
    const maxTargets = Array.isArray(announcement.target_max_groups) ? announcement.target_max_groups : [];
    if (maxTargets.length > 0) {
      try {
        const maxService = createMaxService('main');
        // max_chat_id in DB can be stored as strings or numbers; normalize
        const maxTargetIds = maxTargets.map(String);
        const { data: maxGroups } = await supabase
          .from('max_groups')
          .select('max_chat_id, title')
          .in('max_chat_id', maxTargetIds);

        for (const mg of (maxGroups || [])) {
          const chatId = mg.max_chat_id;
          if (!chatId) continue;

          try {
            const result = await maxService.sendMessageToChat(
              chatId,
              announcement.content,
              { format: 'html' },
            );

            if (result.ok) {
              results[`max:${chatId}`] = { success: true, message_id: result.data?.body?.mid };
              successCount++;
            } else {
              results[`max:${chatId}`] = { success: false, error: result.error?.message || 'MAX API error' };
              failCount++;
            }
          } catch (err: any) {
            results[`max:${chatId}`] = { success: false, error: err.message };
            failCount++;
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (maxErr: any) {
        logger.warn({ error: maxErr.message }, 'Failed to send announcement to MAX groups (service init)');
      }
    }

    // ─── Send personal DMs to participants with announcements consent ───
    try {
      // Найти участников с consent + tg_user_id, зарегистрированных на события.
      // Если анонс привязан к конкретному событию (event_id) — только его участники.
      // Если event_id нет — все участники орг с consent и хотя бы одной регистрацией.
      const dmEventFilter = announcement.event_id
        ? 'AND er.event_id = $2'
        : '';
      const dmParams = announcement.event_id
        ? [announcement.org_id, announcement.event_id]
        : [announcement.org_id];

      const { data: consentParticipants } = await supabase.raw(
        `SELECT DISTINCT p.tg_user_id
         FROM participants p
         JOIN event_registrations er ON er.participant_id = p.id
         JOIN events e ON e.id = er.event_id AND e.org_id = p.org_id
         WHERE p.org_id = $1
           AND p.tg_user_id IS NOT NULL
           AND p.announcements_consent_granted_at IS NOT NULL
           AND (p.announcements_consent_revoked_at IS NULL
                OR p.announcements_consent_revoked_at < p.announcements_consent_granted_at)
           AND p.merged_into IS NULL
           AND er.status != 'cancelled'
           ${dmEventFilter}
         LIMIT 500`,
        dmParams
      );

      if (consentParticipants && consentParticipants.length > 0) {
        const tgService = new TelegramService();
        let dmSent = 0;
        let dmFailed = 0;

        for (const p of consentParticipants) {
          try {
            const dmResult = await tgService.sendMessage(p.tg_user_id, announcement.content, {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            });
            if (dmResult?.ok) {
              dmSent++;
            } else {
              dmFailed++;
            }
          } catch {
            dmFailed++;
          }
          // Задержка чтобы не превысить лимиты
          if ((dmSent + dmFailed) % 25 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        results['personal_dm_tg'] = {
          success: dmSent > 0,
          message_id: undefined,
          error: dmFailed > 0 ? `${dmFailed} TG DMs failed` : undefined,
        };

        if (dmSent > 0) successCount++;

        logger.info({
          announcementId: announcement.id,
          dm_sent: dmSent,
          dm_failed: dmFailed,
          total_consent: consentParticipants.length,
        }, 'Personal TG DMs sent to consented event registrants');
      }

      // Также отправляем DM через Max участникам с max_user_id (без tg_user_id)
      const { data: maxConsentParticipants } = await supabase.raw(
        `SELECT DISTINCT p.max_user_id
         FROM participants p
         JOIN event_registrations er ON er.participant_id = p.id
         JOIN events e ON e.id = er.event_id AND e.org_id = p.org_id
         WHERE p.org_id = $1
           AND p.max_user_id IS NOT NULL
           AND p.tg_user_id IS NULL
           AND p.announcements_consent_granted_at IS NOT NULL
           AND (p.announcements_consent_revoked_at IS NULL
                OR p.announcements_consent_revoked_at < p.announcements_consent_granted_at)
           AND p.merged_into IS NULL
           AND er.status != 'cancelled'
           ${dmEventFilter}
         LIMIT 500`,
        dmParams
      );

      if (maxConsentParticipants && maxConsentParticipants.length > 0) {
        try {
          const maxDmService = createMaxService('main');
          let maxDmSent = 0;
          let maxDmFailed = 0;

          for (const p of maxConsentParticipants) {
            try {
              const dmResult = await maxDmService.sendMessageToUser(
                p.max_user_id,
                announcement.content,
                { format: 'html' }
              );
              if (dmResult?.ok) {
                maxDmSent++;
              } else {
                maxDmFailed++;
              }
            } catch {
              maxDmFailed++;
            }
            if ((maxDmSent + maxDmFailed) % 25 === 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          results['personal_dm_max'] = {
            success: maxDmSent > 0,
            message_id: undefined,
            error: maxDmFailed > 0 ? `${maxDmFailed} Max DMs failed` : undefined,
          };

          if (maxDmSent > 0) successCount++;

          logger.info({
            announcementId: announcement.id,
            dm_sent: maxDmSent,
            dm_failed: maxDmFailed,
            total: maxConsentParticipants.length,
          }, 'Personal Max DMs sent to consented event registrants');
        } catch (maxDmErr: any) {
          logger.warn({ error: maxDmErr.message }, 'Failed to send Max personal DMs');
        }
      }
    } catch (dmErr: any) {
      logger.warn({ error: dmErr.message, announcementId: announcement.id }, 'Failed to send personal DMs');
    }

    // Обновляем статус анонса
    const MAX_RETRIES = 3;
    const retryCount = (announcement.retry_count || 0);
    
    let finalStatus: string;
    const updateData: Record<string, any> = {
      send_results: results,
    };
    
    if (failCount === 0) {
      // All groups succeeded
      finalStatus = 'sent';
      updateData.sent_at = new Date().toISOString();
    } else if (successCount === 0 && retryCount < MAX_RETRIES) {
      // Complete failure but retries remain — reschedule for next cron pass
      finalStatus = 'scheduled';
      updateData.retry_count = retryCount + 1;
      logger.info({
        announcementId: announcement.id,
        retry_count: retryCount + 1,
        max_retries: MAX_RETRIES,
      }, '🔄 Announcement will be retried on next cron pass');
    } else if (successCount > 0) {
      // Partial success — mark as sent (some groups received the message)
      finalStatus = 'sent';
      updateData.sent_at = new Date().toISOString();
    } else {
      // All retries exhausted
      finalStatus = 'failed';
      updateData.sent_at = new Date().toISOString();
    }
    
    updateData.status = finalStatus;
    
    await supabase
      .from('announcements')
      .update(updateData)
      .eq('id', announcement.id);
    
    logger.info({ 
      announcementId: announcement.id,
      successCount,
      failCount,
      status: finalStatus,
      retry_count: updateData.retry_count ?? retryCount
    }, 'Announcement sending completed');
    
    return { successCount, failCount, results };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    const MAX_RETRIES = 3;
    const retryCount = (announcement.retry_count || 0);
    const canRetry = retryCount < MAX_RETRIES;
    
    await supabase
      .from('announcements')
      .update({ 
        status: canRetry ? 'scheduled' : 'failed',
        retry_count: canRetry ? retryCount + 1 : retryCount,
        send_results: { error: errorMessage },
        ...(canRetry ? {} : { sent_at: new Date().toISOString() })
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
  targetGroups: string[],
  useMiniAppLink: boolean = true,
  eventType: 'online' | 'offline' = 'offline',
  targetTopics: Record<string, number> = {},
  targetMaxGroups: string[] = []
): Promise<void> {
  const supabase = createAdminServer();
  
  // Generate event link based on preference
  let eventUrl: string;
  if (useMiniAppLink) {
    // MiniApp link format: https://t.me/<bot>?startapp=e-{eventId}
    // We deliberately use the bot main mini-app form (no /short_name path) — it is
    // more reliable across clients than the /short_name variant, which falls back
    // to in-app browser if the short_name isn't registered for the bot.
    const { generateEventMiniAppLink } = await import('@/lib/telegram/webAppAuth');
    eventUrl = generateEventMiniAppLink(eventId);
  } else {
    // Web link format: https://my.orbo.ru/e/{eventId}
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    eventUrl = `${baseUrl}/e/${eventId}`;
  }
  
  // Формируем текст напоминания за 24 часа (в формате Telegram HTML)
  const escapedTitle = escapeHtml(eventTitle);
  let content24h = `🗓 <b>Напоминание: ${escapedTitle}</b>\n\n`;
  content24h += `📅 Завтра, ${formatDateTime(eventStartTime)}\n`;
  if (eventType === 'online') {
    content24h += `🌐 Онлайн\n`;
    if (eventLocation) {
      content24h += `🔗 <a href="${escapeHtml(eventLocation)}">Ссылка на встречу</a>\n`;
    }
  } else if (eventLocation) {
    content24h += `📍 ${escapeHtml(eventLocation)}\n`;
  }
  if (eventDescription) {
    const shortDesc = eventDescription.length > 200 ? eventDescription.slice(0, 200) + '...' : eventDescription;
    content24h += `\n${shortDesc}\n`;
  }
  content24h += `\n🔗 <a href="${eventUrl}">Подробнее и регистрация</a>`;

  // Формируем текст напоминания за 1 час (в формате Telegram HTML)
  let content1h = `⏰ <b>Через час начинается: ${escapedTitle}</b>\n\n`;
  content1h += `🕐 Начало в ${formatDateTime(eventStartTime).split(', ').pop()}\n`;
  if (eventType === 'online') {
    content1h += `🌐 Онлайн\n`;
    if (eventLocation) {
      content1h += `🔗 <a href="${escapeHtml(eventLocation)}">Ссылка на встречу</a>\n`;
    }
  } else if (eventLocation) {
    content1h += `📍 ${escapeHtml(eventLocation)}\n`;
  }
  content1h += `\n🔗 <a href="${eventUrl}">Подробнее</a>`;
  
  const now = new Date();
  const topicsPayload = Object.keys(targetTopics).length > 0 ? targetTopics : undefined;
  const maxGroupsPayload = targetMaxGroups.length > 0 ? targetMaxGroups : undefined;
  const announcements: Array<{
    org_id: string;
    title: string;
    content: string;
    event_id: string;
    reminder_type: string;
    target_groups: string[];
    target_topics?: Record<string, number>;
    target_max_groups?: string[];
    scheduled_at: string;
    created_by_name: string;
  }> = [];

  // Анонс за 24 часа
  const reminder24h = new Date(eventStartTime.getTime() - 24 * 60 * 60 * 1000);
  if (reminder24h > now) {
    announcements.push({
      org_id: orgId,
      title: `Напоминание за 24ч: ${eventTitle}`,
      content: content24h,
      event_id: eventId,
      reminder_type: '24h',
      target_groups: targetGroups,
      ...(topicsPayload ? { target_topics: topicsPayload } : {}),
      ...(maxGroupsPayload ? { target_max_groups: maxGroupsPayload } : {}),
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
      content: content1h,
      event_id: eventId,
      reminder_type: '1h',
      target_groups: targetGroups,
      ...(topicsPayload ? { target_topics: topicsPayload } : {}),
      ...(maxGroupsPayload ? { target_max_groups: maxGroupsPayload } : {}),
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

/**
 * Экранирует HTML-спецсимволы для безопасной вставки в Telegram HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
