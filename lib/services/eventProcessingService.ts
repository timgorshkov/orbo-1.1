import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramUpdate, TelegramMessage, TelegramUser, TelegramChatMemberUpdate } from './telegramService';
import { createTelegramService } from './telegramService';
import { createServiceLogger } from '@/lib/logger';

/**
 * Сервис для обработки и нормализации событий Telegram
 */
type ParticipantRow = {
  id: string;
  merged_into?: string | null;
  // identity_id removed - column deleted in migration 42
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  username?: string | null;
  source?: string | null;
  participant_status?: string | null;
};

export class EventProcessingService {
  private supabase;
  private logger;
  
  /**
   * Устанавливает клиент Supabase
   */
  setSupabaseClient(client: any) {
    this.supabase = client;
  }
  
  constructor() {
    // Используем hybrid клиент (PostgreSQL для DB, Supabase для Auth)
    this.supabase = createAdminServer();
    
    // Создаем logger для сервиса
    this.logger = createServiceLogger('EventProcessing');
  }
  
  // REMOVED: isUpdateProcessed() and markUpdateProcessed()
  // telegram_updates table was removed in migration 42
  // Idempotency is not currently implemented

  private async getOrgIdsForChat(chatId: number | string): Promise<string[]> {
    const chatIdStr = String(chatId);
    const orgIds = new Set<string>();
    try {
      const { data: mappingRows, error: mappingError } = await this.supabase
        .from('org_telegram_groups')
        .select('org_id')
        .filter('tg_chat_id::text', 'eq', chatIdStr);

      if (mappingError) {
        if (mappingError.code === '42P01') {
          this.logger.warn({ chat_id: chatIdStr }, 'org_telegram_groups table not found');
        } else {
          this.logger.error({ 
            chat_id: chatIdStr,
            error: mappingError.message,
            code: mappingError.code
          }, 'Error fetching org mappings');
        }
      }

      (mappingRows || []).forEach(mapping => {
        if (mapping?.org_id) {
          orgIds.add(mapping.org_id);
        }
      });
    } catch (error) {
      this.logger.error({ 
        chat_id: chatIdStr,
        error: error instanceof Error ? error.message : String(error)
      }, 'Unexpected error fetching mapping orgs');
    }

    const orgList = Array.from(orgIds);

    if (orgList.length === 0) {
      this.logger.debug({ chat_id: chatIdStr }, 'No organizations mapped for chat');
    }

    return orgList;
  }

  private async ensureGroupRecord(chatId: number, title?: string | null): Promise<void> {
    const chatIdStr = String(chatId);

    try {
      const { data: existingGroup, error: fetchError } = await this.supabase
        .from('telegram_groups')
        .select('id, title, bot_status, is_archived')
        .filter('tg_chat_id::text', 'eq', chatIdStr)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        this.logger.error({ 
          chat_id: chatIdStr,
          error: fetchError.message,
          code: fetchError.code
        }, 'Error checking existing group record');
        return;
      }

      if (!existingGroup) {
        const insertPayload: any = {
          tg_chat_id: chatId,
          title: title || `Group ${chatIdStr}`,
          bot_status: 'pending',
          analytics_enabled: false,
          is_archived: false,
          last_sync_at: new Date().toISOString(),
        };

        try {
          await this.supabase
            .from('telegram_groups')
            .insert(insertPayload);
          this.logger.info({ chat_id: chatIdStr, title }, 'Created canonical group record');
        } catch (insertError: any) {
          if (insertError?.code === '23505') {
            // Record already created concurrently
            return;
          }
          this.logger.error({ 
            chat_id: chatIdStr,
            error: insertError.message,
            code: insertError.code
          }, 'Error inserting canonical group record');
        }
      } else {
        const updatePatch: Record<string, any> = {};
        if (title && title !== existingGroup.title) {
          updatePatch.title = title;
        }
        if (existingGroup.bot_status !== 'pending') {
          updatePatch.bot_status = 'pending';
        }
        if (existingGroup.is_archived) {
          updatePatch.is_archived = false;
          updatePatch.archived_at = null;
        }
        if (Object.keys(updatePatch).length > 0) {
          try {
            await this.supabase
              .from('telegram_groups')
              .update(updatePatch)
              .eq('id', existingGroup.id);
          } catch (updateError) {
            this.logger.error({ 
              chat_id: chatIdStr,
              error: updateError instanceof Error ? updateError.message : String(updateError)
            }, 'Error updating canonical group data');
          }
        }
      }
    } catch (error) {
      this.logger.error({ 
        chat_id: chatIdStr,
        error: error instanceof Error ? error.message : String(error)
      }, 'Unexpected ensureGroupRecord error');
    }
  }

  private isAnonymousBot(user?: TelegramUser | null): boolean {
    if (!user) return false;
    return user.id === 1087968824 || user.username === 'GroupAnonymousBot';
  }

  private async setMappingStatus(chatIdStr: string, orgId: string, status: 'active' | 'archived', reason?: string): Promise<void> {
    try {
      const updatePayload: any = { status };
      if (status === 'archived') {
        updatePayload.archived_at = new Date().toISOString();
        updatePayload.archived_reason = reason || null;
      } else {
        updatePayload.archived_at = null;
        updatePayload.archived_reason = null;
      }

      const { error: updateError } = await this.supabase
        .from('org_telegram_groups')
        .update(updatePayload)
        .eq('org_id', orgId)
        .filter('tg_chat_id::text', 'eq', chatIdStr);

      if (updateError) {
        if (updateError.code !== 'PGRST116') {
          this.logger.error({ 
            chat_id: chatIdStr,
            org_id: orgId,
            status,
            error: updateError.message,
            code: updateError.code
          }, 'Error updating mapping status');
        }
        return;
      }

      if (status === 'archived') {
        if (reason !== 'manual_remove') {
          const { count, error: activeCountError } = await this.supabase
            .from('org_telegram_groups')
            .select('*', { count: 'exact', head: true })
            .filter('tg_chat_id::text', 'eq', chatIdStr)
            .eq('status', 'active');

          if (activeCountError) {
            this.logger.error({ 
              chat_id: chatIdStr,
              error: activeCountError.message,
              code: activeCountError.code
            }, 'Error counting active mappings');
          }

          if (!count || count === 0) {
            await this.supabase
              .from('telegram_groups')
              .update({
                is_archived: true,
                archived_at: new Date().toISOString(),
                archived_reason: reason || 'archived'
              })
              .filter('tg_chat_id::text', 'eq', chatIdStr);
          }
        }
      } else {
        await this.supabase
          .from('telegram_groups')
          .update({
            is_archived: false,
            archived_at: null,
            archived_reason: null
          })
          .filter('tg_chat_id::text', 'eq', chatIdStr);
      }
    } catch (error) {
      this.logger.error({ 
        chat_id: chatIdStr,
        org_id: orgId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Unexpected mapping status update error');
    }
  }

  private async archiveMappingsForChat(chatIdStr: string, reason: string): Promise<void> {
    try {
      const { data: mappings, error } = await this.supabase
        .from('org_telegram_groups')
        .select('org_id, status')
        .filter('tg_chat_id::text', 'eq', chatIdStr);

      if (error) {
        if (error.code !== '42P01') {
          this.logger.error({ 
            chat_id: chatIdStr,
            error: error.message,
            code: error.code
          }, 'Error fetching mappings for archival');
        }
        return;
      }

      (mappings || []).forEach(async mapping => {
        if (mapping?.org_id && mapping.status !== 'archived') {
          await this.setMappingStatus(chatIdStr, mapping.org_id, 'archived', reason);
        }
      });
    } catch (err) {
      this.logger.error({ 
        chat_id: chatIdStr,
        error: err instanceof Error ? err.message : String(err)
      }, 'Unexpected error archiving mappings');
    }
  }

  private async activateMappingsForChat(chatIdStr: string): Promise<void> {
    try {
      const { data: mappings, error } = await this.supabase
        .from('org_telegram_groups')
        .select('org_id, status')
        .filter('tg_chat_id::text', 'eq', chatIdStr);

      if (error) {
        if (error.code !== '42P01') {
          this.logger.error({ 
            chat_id: chatIdStr,
            error: error.message,
            code: error.code
          }, 'Error fetching mappings for activation');
        }
        return;
      }

      (mappings || []).forEach(async mapping => {
        if (mapping?.org_id) {
          await this.setMappingStatus(chatIdStr, mapping.org_id, 'active');
        }
      });
    } catch (err) {
      this.logger.error({ 
        chat_id: chatIdStr,
        error: err instanceof Error ? err.message : String(err)
      }, 'Unexpected error activating mappings');
    }
  }
  
  private extractThreadTitle(message: TelegramMessage): string | null {
    const topicCreated = (message as any)?.forum_topic_created;
    if (topicCreated?.name) {
      return topicCreated.name;
    }

    const topicEdited = (message as any)?.forum_topic_edited;
    if (topicEdited?.name) {
      return topicEdited.name;
    }

    const replyTopicCreated = (message as any)?.reply_to_message?.forum_topic_created;
    if (replyTopicCreated?.name) {
      return replyTopicCreated.name;
    }

    const replyTopicEdited = (message as any)?.reply_to_message?.forum_topic_edited;
    if (replyTopicEdited?.name) {
      return replyTopicEdited.name;
    }

    if (typeof (message as any)?.thread_title === 'string') {
      return (message as any).thread_title;
    }

    return null;
  }

  /**
   * Обрабатывает обновление от Telegram
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    // REMOVED: isUpdateProcessed check
    // Method was removed along with telegram_processed_updates table in migration 42
    // Telegram guarantees update uniqueness per webhook, no need for additional deduplication
    
    try {
      // Нормализация события в зависимости от типа
      if (update.message) {
        await this.processMessage(update.message);
      } else if (update.chat_member) {
        await this.processChatMemberUpdate(update.chat_member);
      } else if (update.my_chat_member) {
        await this.processMyBotStatusUpdate(update.my_chat_member);
      } else if (update.callback_query) {
        await this.processCallbackQuery(update.callback_query);
      } else if (update.chat_join_request) {
        await this.processChatJoinRequest(update.chat_join_request);
      }
      
      // REMOVED: markUpdateProcessed call
      // Method was removed along with telegram_processed_updates table in migration 42
    } catch (error) {
      this.logger.error({ 
        update_id: update.update_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Error processing update');
      throw error;
    }
  }
  
  /**
   * Обрабатывает сообщение из группы
   */
  private async processMessage(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    this.logger.debug({ chat_id: chatId, chat_type: typeof chatId }, 'Processing message');

    // System accounts to skip (Telegram service, bots, anonymous)
    const SYSTEM_ACCOUNT_IDS = [
      777000,      // Telegram Service Notifications
      136817688,   // @Channel_Bot
      1087968824   // Group Anonymous Bot
    ];

    if (message.from && SYSTEM_ACCOUNT_IDS.includes(message.from.id)) {
      this.logger.debug({ 
        chat_id: chatId, 
        user_id: message.from.id,
        username: message.from.username
      }, 'Skipping message from system account');
      return;
    }

    if (message.from?.is_bot) {
      this.logger.debug({ 
        chat_id: chatId,
        bot_username: message.from.username,
        bot_id: message.from.id
      }, 'Skipping message from bot user');
      return;
    }

    try {
      const orgIds = await this.getOrgIdsForChat(chatId);

      if (orgIds.length > 0) {
        this.logger.debug({ 
          chat_id: chatId,
          org_count: orgIds.length,
          org_ids: orgIds
        }, 'Found organization bindings for chat');
        for (const orgId of orgIds) {
          await this.processMessageForOrg(message, orgId);
        }
        return;
      }
      
      // Если группа не найдена, но это группа/супергруппа, пробуем добавить
      if (message.chat.type === 'supergroup' || message.chat.type === 'group') {
        await this.ensureGroupRecord(chatId, message.chat.title);
        this.logger.debug({ chat_id: chatId }, 'Message from unmapped group - waiting for organization linking');
        return;
      }
      
      this.logger.debug({ chat_id: chatId, chat_type: message.chat.type }, 'Message from non-group chat - skipping');
      return;
    } catch (error) {
      this.logger.error({ 
        chat_id: chatId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error in processMessage');
      return;
    }
  }

  /**
   * Обрабатывает выход участника из группы
   */
  private async processLeftMember(message: TelegramMessage, orgId: string): Promise<void> {
    if (!message.left_chat_member) return;
    
    const chatId = message.chat.id;
    const member = message.left_chat_member;
    
    if (member.id === 1087968824 || member.username === 'GroupAnonymousBot') {
      this.logger.debug({ chat_id: chatId, org_id: orgId }, 'Skipping left event for GroupAnonymousBot');
      return;
    }

    if (member.is_bot) {
      this.logger.debug({ 
        chat_id: chatId,
        org_id: orgId,
        bot_username: member.username,
        bot_id: member.id
      }, 'Skipping left event for bot user');
      return;
    }
    
    // Записываем событие выхода
    await this.supabase.from('activity_events').insert({
      org_id: orgId,
      event_type: 'leave',
      tg_user_id: member.id,
      tg_chat_id: chatId,
      meta: {
        removed_by: message.from ? {
          id: message.from.id,
          username: message.from.username,
          name: `${message.from.first_name} ${message.from.last_name || ''}`.trim()
        } : null,
        user: {
          username: member.username,
          name: `${member.first_name} ${member.last_name || ''}`.trim()
        }
      }
    });
    
    try {
      // Получаем ID участника из таблицы participants
      const { data: participant } = await this.supabase
        .from('participants')
        .select('id, merged_into')
        .eq('tg_user_id', member.id)
        .eq('org_id', orgId)
        .maybeSingle();
      
      if (participant) {
        if (participant.merged_into) {
          this.logger.debug({ 
            participant_id: participant.id,
            merged_into: participant.merged_into,
            chat_id: chatId,
            org_id: orgId
          }, 'Participant merged - skipping group update');
          return;
        }

        // Обновляем статус участника в группе
        const { data: participantGroup, error: pgError } = await this.supabase
          .from('participant_groups')
          .select('id')
          .eq('participant_id', participant.id)
          .eq('tg_group_id', chatId)
          .maybeSingle();
        
        if (participantGroup) {
          // Обновляем существующую запись
          await this.supabase
            .from('participant_groups')
            .update({
              left_at: new Date().toISOString(),
              is_active: false
            })
            .eq('id', participantGroup.id);
        }
        
        // Счетчик member_count обновляется автоматически через SQL триггер update_member_count_trigger
      }
    } catch (error) {
      this.logger.error({ 
        chat_id: chatId,
        org_id: orgId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error updating participant_groups for leave event');
    }
    
    // NOTE: updateGroupMetrics moved to cron job for performance
  }
    
  /**
   * Обрабатывает новых участников группы
   */
  private async processNewMembers(message: TelegramMessage, orgId: string): Promise<void> {
    if (!message.new_chat_members) return;
    
    const chatId = message.chat.id;
    const fromUser = message.from;
    
    for (const member of message.new_chat_members) {
      if (member.id === 1087968824 || member.username === 'GroupAnonymousBot') {
        this.logger.debug({ chat_id: chatId, org_id: orgId }, 'Skipping join event for GroupAnonymousBot');
        continue;
      }

      if (member.is_bot) {
        this.logger.debug({ 
          chat_id: chatId,
          org_id: orgId,
          bot_username: member.username,
          bot_id: member.id
        }, 'Skipping join event for bot user');
        continue;
      }

      if (member.is_bot) continue; // Пропускаем ботов
      
      // Записываем событие присоединения
      await this.supabase.from('activity_events').insert({
        org_id: orgId,
        event_type: 'join',
        tg_user_id: member.id,
        tg_chat_id: chatId,
        meta: {
          added_by: fromUser ? {
            id: fromUser.id,
            username: fromUser.username,
            name: `${fromUser.first_name} ${fromUser.last_name || ''}`.trim()
          } : null,
          user: {
            username: member.username,
            name: `${member.first_name} ${member.last_name || ''}`.trim()
          }
        }
      });
      
      try {
        const { data: participant } = await this.supabase
          .from('participants')
          .select('id, merged_into, first_name, last_name, full_name, username, participant_status, source')
          .eq('tg_user_id', member.id)
          .eq('org_id', orgId)
          .is('merged_into', null) // Игнорируем объединённых участников
          .maybeSingle() as { data: ParticipantRow | null };

        let participantId: string | null = null;

        // Если нет, создаем запись через UPSERT
        if (!participant) {
          const nowIso = new Date().toISOString();
          const fullNameCandidate = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim();

          const { data: newParticipant, error } = await this.supabase
            .from('participants')
            .upsert({
              org_id: orgId,
              tg_user_id: member.id,
              username: member.username ?? null,
              tg_first_name: member.first_name ?? null, // Telegram имя
              tg_last_name: member.last_name ?? null, // Telegram фамилия
              full_name: fullNameCandidate || member.username || null,
              source: 'telegram_group',
              participant_status: 'participant'
            }, {
              onConflict: 'org_id,tg_user_id',
              ignoreDuplicates: false
            })
            .select('id')
            .single();
          
          if (error) {
            this.logger.error({ 
              tg_user_id: member.id,
              org_id: orgId,
              error: error.message,
              code: error.code
            }, 'Error upserting participant');
            // Fallback: попытаться получить существующего участника
            const { data: existingParticipant } = await this.supabase
              .from('participants')
              .select('id, merged_into')
              .eq('tg_user_id', member.id)
              .eq('org_id', orgId)
              .is('merged_into', null)
              .maybeSingle() as { data: ParticipantRow | null };
            
            if (existingParticipant) {
              participantId = existingParticipant.merged_into || existingParticipant.id;
            } else {
              continue;
            }
          } else {
            participantId = newParticipant?.id;
          }
        } else {
          const patch: Record<string, any> = {};
          const fullNameCandidate = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim();

          // Обновляем Telegram имена (они могут измениться)
          if (member.first_name) {
            patch.tg_first_name = member.first_name;
          }
          if (member.last_name) {
            patch.tg_last_name = member.last_name;
          }
          if ((!participant.full_name || participant.full_name === participant.username) && fullNameCandidate) {
            patch.full_name = fullNameCandidate;
          }
          if (!participant.username && member.username) {
            patch.username = member.username;
          }
          if (!participant.source || participant.source === 'unknown') {
            patch.source = 'telegram_group';
          }

          if (Object.keys(patch).length > 0) {
            patch.updated_at = new Date().toISOString();
            await this.supabase
              .from('participants')
              .update(patch)
              .eq('id', participant.id);
          }

          if (participant.merged_into) {
            participantId = participant.merged_into;
          } else {
            participantId = participant.id;
          }
        }
        
        if (participantId) {
          // Проверяем, есть ли уже связь с группой
          const { data: existingGroup } = await this.supabase
            .from('participant_groups')
            .select('id, is_active')
            .eq('participant_id', participantId)
            .eq('tg_group_id', chatId)
            .maybeSingle();
          
          if (existingGroup) {
            // Если связь есть, но неактивна, активируем ее
            if (!existingGroup.is_active) {
              await this.supabase
                .from('participant_groups')
                .update({
                  is_active: true,
                  left_at: null,
                  joined_at: new Date().toISOString()
                })
                .eq('id', existingGroup.id);
            }
          } else {
            // Если связи нет, создаем (используем upsert для избежания race conditions)
            await this.supabase
              .from('participant_groups')
              .upsert({
                participant_id: participantId,
                tg_group_id: chatId,
                joined_at: new Date().toISOString(),
                is_active: true
              }, { onConflict: 'participant_id,tg_group_id' });
          }
          
          // Счетчик member_count обновляется автоматически через SQL триггер update_member_count_trigger
        }
      } catch (error) {
        this.logger.error({ 
          chat_id: chatId,
          org_id: orgId,
          tg_user_id: member.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Error processing new member');
      }
    }
    
    // Обновляем счетчики и статистику
    await this.updateGroupMetrics(orgId, chatId);
  }

  private async processMessageForOrg(message: TelegramMessage, orgId: string): Promise<void> {
    const chatId = message.chat.id;

    this.logger.debug({ 
      chat_id: chatId,
      org_id: orgId,
      message_id: message.message_id,
      from: message.from?.username,
      message_thread_id: (message as any)?.message_thread_id ?? null,
      is_topic_message: (message as any)?.is_topic_message ?? false
    }, 'Processing message data');
    
    // Обрабатываем новых участников
    await this.recordGlobalMessageEvent(message);

    if (message.new_chat_members && message.new_chat_members.length > 0) {
      await this.processNewMembers(message, orgId);
    } else if (message.left_chat_member) {
      await this.processLeftMember(message, orgId);
    } else {
      await this.processUserMessage(message, orgId);
    }

    // NOTE: updateGroupMetrics moved to cron job for performance
    // Metrics are now updated every 5 minutes instead of per-message
  }
  
  /**
   * Обрабатывает обычное сообщение пользователя
   */
  private async processUserMessage(message: TelegramMessage, orgId: string): Promise<void> {
    this.logger.debug({ 
      org_id: orgId,
      message_id: message.message_id,
      chat_id: message.chat.id,
      from: message.from?.username
    }, 'Processing user message');

    if (!message.from) return;
  
    const chatId = message.chat.id;
    const userId = message.from.id;

    const messageThreadId = typeof (message as any)?.message_thread_id === 'number' ? (message as any).message_thread_id : null;
    const threadTitle = this.extractThreadTitle(message);

    // Skip anonymous and bot users
    if (userId === 1087968824 || message.from.username === 'GroupAnonymousBot' || message.from.is_bot) {
      return;
    }

    const username = message.from.username;
    const fullName = `${message.from.first_name} ${message.from.last_name || ''}`.trim();
    
    // Подсчет сущностей в сообщении
    let linksCount = 0;
    let mentionsCount = 0;
    
    if (message.entities) {
      for (const entity of message.entities) {
        if (entity.type === 'url') linksCount++;
        if (entity.type === 'mention' || entity.type === 'text_mention') mentionsCount++;
      }
    }
    
    let participantRecord: ParticipantRow | null = null;
    let participantId: string | null = null;

    // Проверяем, есть ли пользователь в таблице participants
    try {
      const { data: participant} = await this.supabase
        .from('participants')
        .select('id, merged_into, first_name, last_name, full_name, username, status, source')
        .eq('tg_user_id', userId)
        .eq('org_id', orgId)
        .is('merged_into', null) // Игнорируем объединённых участников
        .maybeSingle() as { data: ParticipantRow | null };

      participantRecord = participant;
      
      // Если участника нет, создаем его через UPSERT
      if (!participant) {
        this.logger.debug({ 
          username,
          tg_user_id: userId,
          org_id: orgId
        }, 'Creating/updating participant');
        
        const nowIso = new Date().toISOString();
        const { data: upsertedParticipant, error } = await this.supabase
          .from('participants')
          .upsert({
            org_id: orgId,
            tg_user_id: userId,
            username: username ?? null,
            tg_first_name: message.from.first_name ?? null, // Telegram имя
            tg_last_name: message.from.last_name ?? null, // Telegram фамилия
            full_name: fullName || username || (userId ? `User ${userId}` : null),
            source: 'telegram_group',
            participant_status: 'participant' // ✅ Исправлено имя колонки
          }, {
            onConflict: 'org_id,tg_user_id',
            ignoreDuplicates: false
          })
          .select('id')
          .single();
        
        if (error) {
          this.logger.error({ 
            tg_user_id: userId,
            org_id: orgId,
            error: error.message,
            code: error.code
          }, 'Error upserting participant from message');
          // Fallback: попытаться получить существующего участника
          const { data: existingParticipant } = await this.supabase
            .from('participants')
            .select('id, merged_into')
            .eq('tg_user_id', userId)
            .eq('org_id', orgId)
            .is('merged_into', null)
            .maybeSingle() as { data: ParticipantRow | null };
          
          if (existingParticipant) {
            participantId = existingParticipant.merged_into || existingParticipant.id;
            this.logger.debug({ participant_id: participantId }, 'Using existing participant');
          }
        } else {
          participantId = upsertedParticipant.id;
          this.logger.debug({ participant_id: participantId }, 'Upserted participant');
        }
      } else {
        participantId = participant.merged_into || participant.id;
        
        // Обновляем Telegram имена (они могут измениться)
        const patch: Record<string, any> = {};
        
        if (message.from.first_name) {
          patch.tg_first_name = message.from.first_name;
        }
        if (message.from.last_name) {
          patch.tg_last_name = message.from.last_name;
        }
        if (message.from.username && !participant.username) {
          patch.username = message.from.username;
        }
        
        if (Object.keys(patch).length > 0) {
          await this.supabase
            .from('participants')
            .update(patch)
            .eq('id', participantId);
          
          this.logger.debug({ 
            participant_id: participantId,
            patch
          }, 'Updated participant with Telegram names');
        }
      }
      
      // Если у нас есть ID участника, проверяем связь с группой
      if (participantId) {
        // Проверяем, есть ли уже связь с группой
        const { data: existingGroup } = await this.supabase
          .from('participant_groups')
          .select('id, is_active')
          .eq('participant_id', participantId)
          .eq('tg_group_id', chatId)
          .maybeSingle();
        
        if (existingGroup) {
          // Если связь есть, но неактивна, активируем ее
          if (!existingGroup.is_active) {
            await this.supabase
              .from('participant_groups')
              .update({
                is_active: true,
                left_at: null,
                joined_at: new Date().toISOString()
              })
              .eq('id', existingGroup.id);
            
            this.logger.debug({ 
              participant_id: participantId,
              chat_id: chatId
            }, 'Reactivated participant in group');
          }
        } else {
          // Если связи нет, создаем (используем upsert для избежания race conditions)
          await this.supabase
            .from('participant_groups')
            .upsert({
              participant_id: participantId,
              tg_group_id: chatId,
              joined_at: new Date().toISOString(),
              is_active: true
            }, { onConflict: 'participant_id,tg_group_id' });
          
          this.logger.debug({ 
            participant_id: participantId,
            chat_id: chatId
          }, 'Added participant to group');
          
          // Счетчик member_count обновляется автоматически через SQL триггер update_member_count_trigger
        }
      }
    } catch (error) {
      this.logger.error({ 
        chat_id: chatId,
        org_id: orgId,
        tg_user_id: userId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error processing participant data');
    }
    
    // REMOVED: writeGlobalActivityEvent() call
    // Method was deprecated and did nothing (telegram_activity_events table removed in migration 42)
    // Activity events are now tracked through activity_events table directly
    
    try {
      this.logger.debug({ 
        org_id: orgId,
        chat_id: chatId,
        message_id: message.message_id
      }, 'Inserting activity event');
      
      // Unified metadata structure for activity_events
      const messageText = message.text || '';
      const textPreview = messageText.substring(0, 500); // First 500 chars for preview
      
      // Determine media type
      let mediaType: string | null = null;
      if (message.photo) mediaType = 'photo';
      else if (message.video) mediaType = 'video';
      else if (message.document) mediaType = 'document';
      else if (message.audio) mediaType = 'audio';
      else if (message.voice) mediaType = 'voice';
      else if ((message as any).sticker) mediaType = 'sticker';
      
      // Extract reactions count if present
      const reactionsCount = (message as any)?.reactions?.reduce((sum: number, r: any) => sum + (r.count || 0), 0) || 0;

      const baseEventData = {
        org_id: orgId,
        event_type: 'message',
        tg_user_id: userId,
        tg_chat_id: chatId,
        message_id: message.message_id,
        message_thread_id: messageThreadId,
        reply_to_message_id: message.reply_to_message?.message_id || null,
        has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
        chars_count: messageText.length,
        links_count: linksCount,
        mentions_count: mentionsCount,
        reactions_count: reactionsCount,
        meta: {
          user: {
            name: fullName,
            username: username,
            tg_user_id: userId
          },
          message: {
            id: message.message_id,
            thread_id: messageThreadId,
            reply_to_id: message.reply_to_message?.message_id || null,
            text_preview: textPreview,
            text_length: messageText.length,
            has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
            media_type: mediaType,
            is_topic_message: (message as any)?.is_topic_message ?? false
          },
          reactions: reactionsCount > 0 ? {
            total_count: reactionsCount,
            reaction_types: (message as any)?.reactions?.map((r: any) => r.type?.emoji || r.type) || []
          } : undefined,
          source: {
            type: 'webhook'
          }
        }
      };
      
      // Check if event already exists (prevent duplicates)
      try {
        const { data: existingEvent } = await this.supabase
          .from('activity_events')
          .select('id, org_id')
          .eq('tg_chat_id', chatId)
          .eq('message_id', message.message_id)
          .eq('event_type', 'message')
          .maybeSingle();
        
        let insertedEvent: any = null;
        
        if (existingEvent) {
          insertedEvent = existingEvent;
        } else {
          try {
            const { data: newEvent, error } = await this.supabase
              .from('activity_events')
              .insert(baseEventData)
              .select('id')
              .single();
          
            if (error) {
              this.logger.error({ 
                org_id: orgId,
                chat_id: chatId,
                message_id: message.message_id,
                error: error.message,
                code: error.code
              }, 'Error inserting activity event');
              throw error;
            }
            insertedEvent = newEvent;
          } catch (insertError: any) {
            if (insertError?.code === '23505') {
              const { data: foundEvent } = await this.supabase
                .from('activity_events')
                .select('id')
                .eq('tg_chat_id', chatId)
                .eq('message_id', message.message_id)
                .eq('event_type', 'message')
                .maybeSingle();
              if (foundEvent) {
                insertedEvent = foundEvent;
              } else {
                throw insertError;
              }
            } else {
              throw insertError;
            }
          }
        }
        
        if (insertedEvent) {
          // Phase 2: Save full message text to participant_messages for analysis
          if (messageText && insertedEvent?.id && participantId) {
            const wordsCount = messageText.trim().split(/\s+/).filter(w => w.length > 0).length;
            
            const { error: messageError } = await this.supabase
              .from('participant_messages')
              .upsert({
                org_id: orgId,
                participant_id: participantId,
                tg_user_id: userId,
                tg_chat_id: chatId,
                activity_event_id: insertedEvent.id,
                message_id: message.message_id,
                message_text: messageText, // ✅ Full text
                message_thread_id: messageThreadId,
                reply_to_message_id: message.reply_to_message?.message_id || null,
                has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
                media_type: mediaType,
                chars_count: messageText.length,
                words_count: wordsCount,
                sent_at: new Date(message.date * 1000).toISOString() // Telegram timestamp
              }, {
                onConflict: 'tg_chat_id,message_id',
                ignoreDuplicates: true
              });
            
            if (messageError) {
              this.logger.warn({ 
                org_id: orgId,
                chat_id: chatId,
                message_id: message.message_id,
                error: messageError.message
              }, 'Failed to save message text');
              // Non-critical error, continue processing
            }
          }
        }
      } catch (baseError) {
        this.logger.error({ 
          org_id: orgId,
          chat_id: chatId,
          message_id: message.message_id,
          error: baseError instanceof Error ? baseError.message : String(baseError)
        }, 'Error in base insert, trying with minimal fields');
        
        // Если не получилось, пробуем с минимальным набором полей (только обязательные поля из миграции)
        const minimalEventData = {
          org_id: orgId,
          event_type: 'message',
          tg_user_id: userId,
          tg_chat_id: chatId,
          message_id: message.message_id,
          meta: {
            message_id: message.message_id,
            user: {
              username: username,
              name: fullName
            }
          }
        };
        
        try {
          const { error: minimalError } = await this.supabase.from('activity_events').insert(minimalEventData);
          
          if (minimalError) {
            this.logger.error({ 
              org_id: orgId,
              chat_id: chatId,
              message_id: message.message_id,
              error: minimalError.message
            }, 'Minimal insert error');
          }
        } catch (minimalInsertError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            message_id: message.message_id,
            error: minimalInsertError instanceof Error ? minimalInsertError.message : String(minimalInsertError)
          }, 'Fatal error inserting activity event');
        }
      }
    } catch (error) {
      this.logger.error({ 
        org_id: orgId,
        chat_id: chatId,
        message_id: message.message_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Exception in activity event insert');
    }
    
    // Сохраняем текст сообщения (если есть)
    if (message.text && message.text.trim().length > 0) {
      await this.saveMessageText(message, orgId, participantId);
    }
    
    try {
      // Обновляем время последней активности пользователя
      const patch: Record<string, any> = {
        last_activity_at: new Date().toISOString()
      };

      const from = message.from;
      if (participantRecord) {
        if (!participantRecord.first_name && from.first_name) {
          patch.first_name = from.first_name;
        }
        if (!participantRecord.last_name && from.last_name) {
          patch.last_name = from.last_name;
        }
        if (!participantRecord.username && from.username) {
          patch.username = from.username;
        }
        const fullNameCandidate = `${from.first_name ?? ''} ${from.last_name ?? ''}`.trim();
        if ((!participantRecord.full_name || participantRecord.full_name === participantRecord.username) && fullNameCandidate) {
          patch.full_name = fullNameCandidate;
        }
        if (!participantRecord.source || participantRecord.source === 'unknown') {
          patch.source = 'telegram_group';
        }
      }

      patch.updated_at = new Date().toISOString();

      await this.supabase
        .from('participants')
        .update(patch)
        .eq('tg_user_id', userId)
        .eq('org_id', orgId);
      
      // Обновляем время последнего сообщения группы
      await this.supabase
        .from('telegram_groups')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('tg_chat_id', chatId);
    } catch (error) {
      this.logger.error({ 
        chat_id: chatId,
        org_id: orgId,
        tg_user_id: userId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error updating last activity');
    }
  }
 
  private async recordGlobalMessageEvent(message: TelegramMessage): Promise<void> {
    if (!message?.chat?.id) {
      return;
    }

    const chatId = message.chat.id;
    const createdAt = typeof message.date === 'number'
      ? new Date(message.date * 1000).toISOString()
      : new Date().toISOString();
    const messageId = typeof message.message_id === 'number' ? message.message_id : null;

    if (Array.isArray(message.new_chat_members) && message.new_chat_members.length > 0) {
      // REMOVED: writeGlobalActivityEvent() calls
      // Deprecated method that did nothing (telegram_activity_events removed in migration 42)
      // Join events are tracked through activity_events table
      for (const member of message.new_chat_members) {
        /*
        await this.writeGlobalActivityEvent({
          tg_chat_id: chatId,
          identity_id: null,
          tg_user_id: member.id,
          event_type: 'join',
          created_at: createdAt,
          message_id: messageId,
          reply_to_message_id: message.reply_to_message?.message_id ?? null,
          message_thread_id: null,
          thread_title: null,
          meta: {
            user: {
              id: member.id,
              username: member.username ?? null,
              name: `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || null
            },
            added_by: message.from
              ? {
                  id: message.from.id,
                  username: message.from.username ?? null,
                  name: `${message.from.first_name ?? ''} ${message.from.last_name ?? ''}`.trim() || null
                }
              : null
          }
        });
        */
      }
      
      return; // Early return after processing join events
    }

    if (message.left_chat_member) {
      // REMOVED: writeGlobalActivityEvent() call
      // Deprecated method that did nothing (telegram_activity_events removed in migration 42)
      // Leave events are tracked through activity_events table directly in processNewMessage
      
      return; // Early return after processing leave events
    }

    const fromUser = message.from;
    if (!fromUser) {
      return;
    }

    if (this.isAnonymousBot(fromUser)) {
      return;
    }

    if (fromUser.is_bot) {
      return;
    }

    let linksCount = 0;
    let mentionsCount = 0;

    if (message.entities) {
      for (const entity of message.entities) {
        if (entity.type === 'url') linksCount++;
        if (entity.type === 'mention' || entity.type === 'text_mention') mentionsCount++;
      }
    }

    const messageThreadId = typeof (message as any)?.message_thread_id === 'number'
      ? (message as any).message_thread_id
      : null;
    const threadTitle = this.extractThreadTitle(message);

    const fullName = `${fromUser.first_name ?? ''} ${fromUser.last_name ?? ''}`.trim() || null;

    // REMOVED: writeGlobalActivityEvent() call
    // Deprecated method that did nothing (telegram_activity_events removed in migration 42)
    // Message events are tracked through activity_events table directly in processNewMessage
    
    // REMOVED: saveMessageText() call
    // Message text saving is handled in processNewMessage along with activity event recording
  }

  /**
   * Обрабатывает изменение статуса участника в группе
   */
  private async processChatMemberUpdate(update: TelegramChatMemberUpdate): Promise<void> {
    const chatId = update.chat.id;

    if (update.new_chat_member?.user?.id === 1087968824 || update.new_chat_member?.user?.username === 'GroupAnonymousBot') {
      this.logger.debug({ chat_id: chatId }, 'Skipping chat member update for GroupAnonymousBot');
      return;
    }

    if (update.new_chat_member?.user?.is_bot) {
      this.logger.debug({ 
        chat_id: chatId,
        bot_username: update.new_chat_member.user.username,
        bot_id: update.new_chat_member.user.id
      }, 'Skipping chat member update for bot user');
      return;
    }

    const orgIds = await this.getOrgIdsForChat(chatId);

    if (orgIds.length === 0) {
      this.logger.debug({ chat_id: chatId }, 'Member update from unmapped group - skipping');
      return;
    }

    const userId = update.new_chat_member.user.id;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;

    for (const orgId of orgIds) {
      // Если пользователь покинул группу или был исключен
      if ((oldStatus !== 'left' && oldStatus !== 'kicked') &&
          (newStatus === 'left' || newStatus === 'kicked')) {
        await this.supabase.from('activity_events').insert({
          org_id: orgId,
          event_type: 'leave',
          tg_user_id: userId,
          tg_chat_id: chatId,
          meta: {
            old_status: oldStatus,
            new_status: newStatus,
            removed_by: update.from ? {
              id: update.from.id,
              username: update.from.username,
              name: `${update.from.first_name} ${update.from.last_name || ''}`.trim()
            } : null
          }
        });
        await this.setMappingStatus(String(chatId), orgId, 'archived', 'member_removed');
      }

      // Если пользователь присоединился к группе
      if ((oldStatus === 'left' || oldStatus === 'kicked') &&
          (newStatus !== 'left' && newStatus !== 'kicked')) {
        await this.supabase.from('activity_events').insert({
          org_id: orgId,
          event_type: 'join',
          tg_user_id: userId,
          tg_chat_id: chatId,
          meta: {
            old_status: oldStatus,
            new_status: newStatus,
            added_by: update.from ? {
              id: update.from.id,
              username: update.from.username,
              name: `${update.from.first_name} ${update.from.last_name || ''}`.trim()
            } : null
          }
        });
        await this.setMappingStatus(String(chatId), orgId, 'active');
      }

      await this.updateGroupMetrics(orgId, chatId);
    }
  }
  
  /**
   * Обрабатывает изменение статуса бота в группе
   */
  private async processMyBotStatusUpdate(update: TelegramChatMemberUpdate): Promise<void> {
    const chatId = update.chat.id;
    const newStatus = update.new_chat_member.status;
    const chatIdStr = String(chatId);
    
    await this.ensureGroupRecord(chatId, update.chat?.title);

    if (newStatus === 'administrator') {
      await this.supabase
        .from('telegram_groups')
        .update({
          bot_status: 'connected',
          last_sync_at: new Date().toISOString(),
          is_archived: false,
          archived_at: null,
          archived_reason: null
        })
        .filter('tg_chat_id::text', 'eq', chatIdStr);

      await this.activateMappingsForChat(chatIdStr);
      return;
    }

    if (['member', 'restricted', 'left', 'kicked'].includes(newStatus)) {
      await this.supabase
        .from('telegram_groups')
        .update({
          bot_status: newStatus === 'member' ? 'pending' : 'inactive',
          last_sync_at: new Date().toISOString()
        })
        .filter('tg_chat_id::text', 'eq', chatIdStr);

      const reason = newStatus === 'left' || newStatus === 'kicked' ? 'bot_removed' : 'bot_not_admin';
      await this.archiveMappingsForChat(chatIdStr, reason);
    }
  }
  
  /**
   * Обрабатывает запрос на вступление в группу
   */
  private async processChatJoinRequest(request: any): Promise<void> {
    const chatId = request.chat.id;

    if (request.from?.id === 1087968824 || request.from?.username === 'GroupAnonymousBot') {
      this.logger.debug({ chat_id: chatId }, 'Skipping join request for GroupAnonymousBot');
      return;
    }

    if (request.from?.is_bot) {
      this.logger.debug({ 
        chat_id: chatId,
        bot_username: request.from.username,
        bot_id: request.from.id
      }, 'Skipping join request for bot user');
      return;
    }

    const orgIds = await this.getOrgIdsForChat(chatId);

    if (orgIds.length === 0) {
      this.logger.debug({ chat_id: chatId }, 'Join request from unmapped group - skipping');
      return;
    }

    const userId = request.from.id;

    for (const orgId of orgIds) {
      // Log activity event (legacy)
      await this.supabase.from('activity_events').insert({
        org_id: orgId,
        event_type: 'service',
        tg_user_id: userId,
        tg_chat_id: chatId,
        meta: {
          service_type: 'join_request',
          user: {
            id: userId,
            username: request.from.username,
            name: `${request.from.first_name} ${request.from.last_name || ''}`.trim()
          },
          bio: request.bio
        }
      });
      
      // Process through new application system
      try {
        const { processJoinRequest } = await import('./applicationService');
        
        await processJoinRequest(orgId, {
          chatId,
          userId,
          username: request.from.username,
          firstName: request.from.first_name,
          lastName: request.from.last_name,
          bio: request.bio,
          date: request.date,
          inviteLink: request.invite_link?.invite_link
        });
      } catch (err) {
        // Non-critical - log and continue
        this.logger.warn({ 
          error: err, 
          org_id: orgId, 
          user_id: userId 
        }, 'Failed to process join request through application system');
      }
    }
  }
  
  /**
   * Обрабатывает callback-запрос (нажатие на кнопку)
   */
  private async processCallbackQuery(query: any): Promise<void> {
    if (!query.message) return;
    const chatId = query.message.chat.id;

    if (query.from?.id === 1087968824 || query.from?.username === 'GroupAnonymousBot') {
      this.logger.debug({ chat_id: chatId }, 'Skipping callback query for GroupAnonymousBot');
      return;
    }

    if (query.from?.is_bot) {
      this.logger.debug({ 
        chat_id: chatId,
        bot_username: query.from.username,
        bot_id: query.from.id
      }, 'Skipping callback query for bot user');
      return;
    }

    const orgIds = await this.getOrgIdsForChat(chatId);

    if (orgIds.length === 0) {
      this.logger.debug({ chat_id: chatId }, 'Callback query from unmapped group - skipping');
      return;
    }
    const userId = query.from.id;

    for (const orgId of orgIds) {
      await this.supabase.from('activity_events').insert({
        org_id: orgId,
        event_type: 'callback',
        tg_user_id: userId,
        tg_chat_id: chatId,
        message_id: query.message.message_id,
        meta: {
          callback_data: query.data,
          user: {
            id: userId,
            username: query.from.username,
            name: `${query.from.first_name} ${query.from.last_name || ''}`.trim()
          }
        }
      });

      await this.supabase
        .from('participants')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('tg_user_id', userId)
        .eq('org_id', orgId);
    }
  }
  
  /**
   * Обновляет метрики группы
   */
  private async updateGroupMetrics(orgId: string, chatId: number): Promise<void> {
    this.logger.debug({ chat_id: chatId, org_id: orgId }, 'Updating group metrics');
    
    // Сначала проверяем, существует ли таблица group_metrics
    try {
      // Проверяем существование таблицы group_metrics
      const { data: tableCheck, error: tableError } = await this.supabase
        .from('group_metrics')
        .select('id')
        .limit(1);
        
      if (tableError) {
        this.logger.warn({ 
          error: tableError.message,
          code: tableError.code
        }, 'Error checking group_metrics table - skipping metrics update');
        return;
      }
      
      const today = new Date().toISOString().split('T')[0];
      
      // Получаем метрики за сегодня
      const { data: todayMetrics, error: metricsError } = await this.supabase
        .from('group_metrics')
        .select('id')
        .eq('org_id', orgId)
        .eq('tg_chat_id', chatId)
        .eq('date', today)
        .maybeSingle();
      
      if (metricsError) {
        this.logger.error({ 
          org_id: orgId,
          chat_id: chatId,
          error: metricsError.message
        }, 'Error fetching today metrics');
        return;
      }
      
      // Получаем количество сообщений за сегодня
      let messageCount = 0;
      try {
        const { count, error: messageError } = await this.supabase
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        if (messageError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            error: messageError.message
          }, 'Error counting messages');
        } else {
          messageCount = count || 0;
        }
      } catch (error) {
        this.logger.warn({ 
          org_id: orgId,
          chat_id: chatId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Transient error counting messages');
      }
      
      // Получаем количество ответов за сегодня
      let replyCount = 0;
      try {
        const { count, error: replyError } = await this.supabase
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .not('reply_to_message_id', 'is', null)
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        if (replyError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            error: replyError.message
          }, 'Error counting replies');
        } else {
          replyCount = count || 0;
        }
      } catch (error) {
        this.logger.warn({ 
          org_id: orgId,
          chat_id: chatId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Transient error counting replies');
      }
      
      // Получаем количество присоединений за сегодня
      let joinCount = 0;
      try {
        const { count, error: joinError } = await this.supabase
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'join')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        if (joinError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            error: joinError.message
          }, 'Error counting joins');
        } else {
          joinCount = count || 0;
        }
      } catch (error) {
        this.logger.warn({ 
          org_id: orgId,
          chat_id: chatId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Transient error counting joins');
      }
      
      // Получаем количество выходов за сегодня
      let leaveCount = 0;
      try {
        const { count, error: leaveError } = await this.supabase
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'leave')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        if (leaveError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            error: leaveError.message
          }, 'Error counting leaves');
        } else {
          leaveCount = count || 0;
        }
      } catch (error) {
        this.logger.warn({ 
          org_id: orgId,
          chat_id: chatId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Transient error counting leaves');
      }
      
      // Получаем количество уникальных пользователей за сегодня (DAU)
      let dau = 0;
      try {
        const { data: uniqueUsers, error: dauError } = await this.supabase
          .from('activity_events')
          .select('tg_user_id')
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .in('event_type', ['message', 'reaction', 'callback'])
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        if (dauError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            error: dauError.message
          }, 'Error counting DAU');
        } else {
          dau = uniqueUsers ? new Set(uniqueUsers.map(u => u.tg_user_id)).size : 0;
        }
      } catch (error) {
        // Network errors are transient - log as warn, not error
        // DAU defaults to 0 which is acceptable
        this.logger.warn({ 
          org_id: orgId,
          chat_id: chatId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Transient error counting DAU');
      }
      
      // Вычисляем reply ratio
      const replyRatio = messageCount ? Math.round(((replyCount || 0) / messageCount) * 100) : 0;
      
      // Вычисляем net member change
      const netMemberChange = (joinCount || 0) - (leaveCount || 0);
      
      const metricsData = {
        org_id: orgId,
        tg_chat_id: chatId,
        date: today,
        dau,
        message_count: messageCount || 0,
        reply_count: replyCount || 0,
        reply_ratio: replyRatio,
        join_count: joinCount || 0,
        leave_count: leaveCount || 0,
        net_member_change: netMemberChange
      };
      
      if (todayMetrics) {
        // Обновляем существующую запись
        const { error: updateError } = await this.supabase
          .from('group_metrics')
          .update(metricsData)
          .eq('id', todayMetrics.id);
          
        if (updateError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            metrics_id: todayMetrics.id,
            error: updateError.message
          }, 'Error updating metrics');
        } else {
          this.logger.debug({ 
            org_id: orgId,
            chat_id: chatId,
            metrics: metricsData
          }, 'Group metrics updated successfully');
        }
      } else {
        // Создаем новую запись
        const { error: insertError } = await this.supabase
          .from('group_metrics')
          .insert(metricsData);
          
        if (insertError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            error: insertError.message
          }, 'Error inserting metrics');
        } else {
          this.logger.debug({ 
            org_id: orgId,
            chat_id: chatId,
            metrics: metricsData
          }, 'Group metrics created successfully');
        }
      }
    } catch (error) {
      this.logger.error({ 
        org_id: orgId,
        chat_id: chatId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Exception in updateGroupMetrics');
    }
  }

  // REMOVED: ensureIdentity() method
  // telegram_identities table was removed in migration 42
  
  // REMOVED: writeGlobalActivityEvent() method
  // telegram_activity_events table was removed in migration 42
  // All activity tracking is now handled through the activity_events table

  /**
   * Сохраняет текст сообщения в таблицу participant_messages для последующего анализа
   */
  private async saveMessageText(
    message: TelegramMessage, 
    orgId: string, 
    participantId: string | null
  ): Promise<void> {
    try {
      const messageText = message.text?.trim() || null;
      if (!messageText || messageText.length === 0) {
        return;
      }

      this.logger.debug({ 
        org_id: orgId,
        chat_id: message.chat.id,
        message_id: message.message_id,
        text_length: messageText.length
      }, 'Saving message text');

      const mediaType = this.detectMediaType(message);
      const wordsCount = messageText.split(/\s+/).filter(w => w.length > 0).length;

      const { error } = await this.supabase
        .from('participant_messages')
        .upsert({
          org_id: orgId,
          participant_id: participantId,
          tg_user_id: message.from?.id,
          tg_chat_id: message.chat.id,
          message_id: message.message_id,
          message_text: messageText,
          message_thread_id: (message as any)?.message_thread_id || null,
          reply_to_message_id: message.reply_to_message?.message_id || null,
          has_media: !!(message.photo || message.video || message.document || message.audio || message.voice || (message as any).sticker),
          media_type: mediaType,
          chars_count: messageText.length,
          words_count: wordsCount,
          sent_at: new Date(message.date * 1000).toISOString()
        }, { onConflict: 'tg_chat_id,message_id' });

      if (error) {
        this.logger.error({ 
          org_id: orgId,
          chat_id: message.chat.id,
          message_id: message.message_id,
          error: error.message,
          code: error.code
        }, 'Save text error');
      }
    } catch (error) {
      this.logger.error({ 
        org_id: orgId,
        chat_id: message.chat.id,
        message_id: message.message_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Exception saving message text');
    }
  }

  /**
   * Определяет тип медиа в сообщении
   */
  private detectMediaType(message: TelegramMessage): string | null {
    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.document) return 'document';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if ((message as any).sticker) return 'sticker';
    if ((message as any).animation) return 'animation';
    if ((message as any).video_note) return 'video_note';
    return null;
  }

  /**
   * Обрабатывает событие реакции на сообщение
   */
  async processReaction(reaction: any, orgId: string): Promise<void> {
    try {
      const chatId = reaction.chat?.id;
      const messageId = reaction.message_id;
      const userId = reaction.user?.id;
      const newReactions = reaction.new_reaction || [];
      const oldReactions = reaction.old_reaction || [];

      if (!chatId || !messageId || !userId) {
        return;
      }

      this.logger.debug({ 
        org_id: orgId,
        chat_id: chatId,
        message_id: messageId,
        user_id: userId
      }, 'Processing reaction');

      // 1. Ensure participant exists
      const { data: participant } = await this.supabase
        .from('participants')
        .select('id')
        .eq('tg_user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();

      let participantId = participant?.id;

      if (!participantId) {
        // Create participant if doesn't exist
        const { data: newParticipant, error: participantError } = await this.supabase
          .from('participants')
          .insert({
            org_id: orgId,
            tg_user_id: userId,
            source: 'telegram',
            last_activity_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (participantError) {
          this.logger.error({ 
            org_id: orgId,
            tg_user_id: userId,
            error: participantError.message,
            code: participantError.code
          }, 'Error creating participant');
          return;
        }

        participantId = newParticipant.id;
      }

      // Update reactions_count on the original message
      const reactionDelta = newReactions.length - oldReactions.length;

      if (reactionDelta !== 0) {
        const { error: updateError } = await this.supabase.rpc('increment_reactions_count', {
          p_org_id: orgId,
          p_tg_chat_id: chatId,
          p_message_id: messageId,
          p_delta: reactionDelta
        });

        if (updateError) {
          this.logger.error({ 
            org_id: orgId,
            chat_id: chatId,
            message_id: messageId,
            error: updateError.message
          }, 'Reactions update error');
        }
      }

      // 3. Record reaction event
      const reactionTypes = newReactions.map((r: any) => r.emoji || r.type).filter(Boolean);
      
      const { error: insertError } = await this.supabase
        .from('activity_events')
        .insert({
          org_id: orgId,
          event_type: 'reaction',
          tg_user_id: userId,
          tg_chat_id: chatId,
          message_id: messageId,
          import_source: 'webhook',
          meta: {
            user: {
              tg_user_id: userId
            },
            reaction: {
              message_id: messageId,
              old_reactions: oldReactions,
              new_reactions: newReactions,
              reaction_types: reactionTypes,
              delta: reactionDelta
            },
            source: {
              type: 'webhook'
            }
          },
          created_at: new Date(reaction.date * 1000).toISOString()
        });

      if (insertError) {
        this.logger.error({ 
          org_id: orgId,
          chat_id: chatId,
          message_id: messageId,
          error: insertError.message,
          code: insertError.code
        }, 'Reaction insert error');
      }

      // Update participant last_activity_at
      await this.supabase
        .from('participants')
        .update({
          last_activity_at: new Date().toISOString()
        })
        .eq('id', participantId);

      // Update group metrics
      await this.updateGroupMetrics(orgId, chatId);
    } catch (error) {
      this.logger.error({ 
        org_id: orgId,
        chat_id: reaction.chat?.id,
        message_id: reaction.message_id,
        user_id: reaction.user?.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Error processing reaction');
    }
  }
}

/**
 * Создает экземпляр сервиса обработки событий
 */
export function createEventProcessingService() {
  return new EventProcessingService();
}
