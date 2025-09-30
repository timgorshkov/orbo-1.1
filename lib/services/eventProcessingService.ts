import { createClientServer } from '@/lib/server/supabaseServer';
import { TelegramUpdate, TelegramMessage, TelegramUser, TelegramChatMemberUpdate } from './telegramService';
import { createTelegramService } from './telegramService';
import { createClient } from '@supabase/supabase-js';

/**
 * Сервис для обработки и нормализации событий Telegram
 */
export class EventProcessingService {
  private supabase;
  
  /**
   * Устанавливает клиент Supabase
   */
  setSupabaseClient(client: any) {
    this.supabase = client;
  }
  
  constructor() {
    // Создаем клиент Supabase с сервисной ролью для обхода RLS
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false
        }
      }
    );
  }
  
  /**
   * Проверяет, было ли обновление уже обработано
   */
  async isUpdateProcessed(updateId: number): Promise<boolean> {
    const { data } = await this.supabase
      .from('telegram_updates')
      .select('id')
      .eq('update_id', updateId)
      .single();
    
    return !!data;
  }
  
  /**
   * Отмечает обновление как обработанное
   */
  async markUpdateProcessed(updateId: number): Promise<void> {
    await this.supabase
      .from('telegram_updates')
      .insert({ update_id: updateId });
  }

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
          console.warn('org_telegram_groups table not found while fetching mappings for chat', chatIdStr);
        } else {
          console.error('Error fetching org mappings for chat', chatIdStr, mappingError);
        }
      }

      (mappingRows || []).forEach(mapping => {
        if (mapping?.org_id) {
          orgIds.add(mapping.org_id);
        }
      });
    } catch (error) {
      console.error('Unexpected error fetching mapping orgs for chat', chatIdStr, error);
    }

    try {
      const { data: baseGroups, error: baseError } = await this.supabase
        .from('telegram_groups')
        .select('org_id')
        .filter('tg_chat_id::text', 'eq', chatIdStr);

      if (baseError && baseError.code !== 'PGRST116') {
        console.error('Error fetching base group for chat', chatIdStr, baseError);
      }

      (baseGroups || []).forEach(group => {
        if (group?.org_id) {
          orgIds.add(group.org_id);
        }
      });
    } catch (error) {
      console.error('Unexpected error fetching base group orgs for chat', chatIdStr, error);
    }

    const orgList = Array.from(orgIds);

    if (orgList.length === 0) {
      console.log(`No organizations mapped for chat ${chatIdStr}`);
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
        console.error('Error checking existing group record for chat', chatIdStr, fetchError);
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
          console.log(`Created canonical group record for chat ${chatIdStr}`);
        } catch (insertError: any) {
          if (insertError?.code === '23505') {
            // Record already created concurrently
            return;
          }
          console.error('Error inserting canonical group record for chat', chatIdStr, insertError);
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
            console.error('Error updating canonical group data for chat', chatIdStr, updateError);
          }
        }
      }
    } catch (error) {
      console.error('Unexpected ensureGroupRecord error for chat', chatIdStr, error);
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
          console.error('Error updating mapping status', chatIdStr, orgId, updateError);
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
            console.error('Error counting active mappings for chat', chatIdStr, activeCountError);
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
      console.error('Unexpected mapping status update error for chat', chatIdStr, orgId, error);
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
          console.error('Error fetching mappings for archival', chatIdStr, error);
        }
        return;
      }

      (mappings || []).forEach(async mapping => {
        if (mapping?.org_id && mapping.status !== 'archived') {
          await this.setMappingStatus(chatIdStr, mapping.org_id, 'archived', reason);
        }
      });
    } catch (err) {
      console.error('Unexpected error archiving mappings for chat', chatIdStr, err);
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
          console.error('Error fetching mappings for activation', chatIdStr, error);
        }
        return;
      }

      (mappings || []).forEach(async mapping => {
        if (mapping?.org_id) {
          await this.setMappingStatus(chatIdStr, mapping.org_id, 'active');
        }
      });
    } catch (err) {
      console.error('Unexpected error activating mappings for chat', chatIdStr, err);
    }
  }
  
  /**
   * Обрабатывает обновление от Telegram
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    // Проверка идемпотентности
    const isProcessed = await this.isUpdateProcessed(update.update_id);
    if (isProcessed) {
      console.log(`Update ${update.update_id} already processed, skipping`);
      return;
    }
    
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
      
      // Отмечаем обновление как обработанное
      await this.markUpdateProcessed(update.update_id);
    } catch (error) {
      console.error(`Error processing update ${update.update_id}:`, error);
      throw error;
    }
  }
  
  /**
   * Обрабатывает сообщение из группы
   */
  private async processMessage(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    console.log('Processing message from chat ID:', chatId, 'Type:', typeof chatId);

    if (message.from && (message.from.id === 1087968824 || message.from.username === 'GroupAnonymousBot')) {
      console.log('Skipping message from GroupAnonymousBot');
      return;
    }

    try {
      const orgIds = await this.getOrgIdsForChat(chatId);

      if (orgIds.length > 0) {
        console.log(`Found ${orgIds.length} organization bindings for chat ${chatId}`);
        for (const orgId of orgIds) {
          await this.processMessageForOrg(message, orgId);
        }
        return;
      }
      
      // Если группа не найдена, но это группа/супергруппа, пробуем добавить
      if (message.chat.type === 'supergroup' || message.chat.type === 'group') {
        await this.ensureGroupRecord(chatId, message.chat.title);
        console.log(`Message from unmapped group ${chatId}, waiting for explicit organization linking`);
        return;
      }
      
      console.log(`Message from non-group chat ${chatId}, skipping`);
      return;
    } catch (error) {
      console.error('Error in processMessage:', error);
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
      console.log('Skipping left event for GroupAnonymousBot');
      return;
    }

    if (member.is_bot) return; // Пропускаем ботов
    
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
          console.log(`Participant ${participant.id} merged into ${participant.merged_into}, skipping group update`);
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
        
        // Обновляем счетчик участников в группе
        await this.supabase
          .from('telegram_groups')
          .update({
            member_count: this.supabase.rpc('decrement_counter', { row_id: chatId })
          })
          .eq('tg_chat_id', chatId);
      }
    } catch (error) {
      console.error('Error updating participant_groups for leave event:', error);
    }
    
    // Обновляем счетчики и статистику
    await this.updateGroupMetrics(orgId, chatId);
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
        console.log('Skipping join event for GroupAnonymousBot');
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
        const identityId = await this.ensureIdentity(member);

        const { data: participant } = await this.supabase
          .from('participants')
          .select('id, merged_into, identity_id')
          .eq('tg_user_id', member.id)
          .eq('org_id', orgId)
          .maybeSingle();
        
        // Если нет, создаем запись
        if (!participant) {
          const { data: newParticipant, error } = await this.supabase
            .from('participants')
            .insert({
              org_id: orgId,
              tg_user_id: member.id,
              username: member.username,
              full_name: `${member.first_name} ${member.last_name || ''}`.trim(),
              identity_id: identityId,
              merged_into: null,
              last_activity_at: new Date().toISOString()
            })
            .select('id')
            .single();
          
          if (error) {
            console.error('Error creating participant:', error);
            continue;
          }
          
          participantId = newParticipant?.id;
        } else {
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
            // Если связи нет, создаем
            await this.supabase
              .from('participant_groups')
              .insert({
                participant_id: participantId,
                tg_group_id: chatId,
                joined_at: new Date().toISOString(),
                is_active: true
              });
          }
          
          // Обновляем счетчик участников в группе
          await this.supabase
            .from('telegram_groups')
            .update({
              member_count: this.supabase.rpc('increment_counter', { row_id: chatId })
            })
            .eq('tg_chat_id', chatId);
        }
      } catch (error) {
        console.error('Error processing new member:', error);
      }
    }
    
    // Обновляем счетчики и статистику
    await this.updateGroupMetrics(orgId, chatId);
  }

  private async processMessageForOrg(message: TelegramMessage, orgId: string): Promise<void> {
    const chatId = message.chat.id;

    console.log('Processing message data:', {
      chatId,
      orgId,
      messageId: message.message_id,
      from: message.from?.username
    });
    
    // Обрабатываем новых участников
    if (message.new_chat_members && message.new_chat_members.length > 0) {
      await this.processNewMembers(message, orgId);
      return;
    }
    
    // Обрабатываем выход участника
    if (message.left_chat_member) {
      await this.processLeftMember(message, orgId);
      return;
    }
    
    // Обрабатываем обычное сообщение
    await this.processUserMessage(message, orgId);
    
    // Обновляем метрики группы
    await this.updateGroupMetrics(orgId, chatId);
  }
  
  /**
   * Обрабатывает обычное сообщение пользователя
   */
  private async processUserMessage(message: TelegramMessage, orgId: string): Promise<void> {

    if (!message.from) return;
  
    const chatId = message.chat.id;
    const userId = message.from.id;

    if (userId === 1087968824 || message.from.username === 'GroupAnonymousBot') {
      console.log('Skipping user message for GroupAnonymousBot');
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
    
    // Проверяем, есть ли пользователь в таблице participants
    try {
      const identityId = await this.ensureIdentity(message.from);

      const { data: participant } = await this.supabase
        .from('participants')
        .select('id, merged_into, identity_id')
        .eq('tg_user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();
      
      let participantId;
      
      // Если участника нет, создаем его
      if (!participant) {
        console.log(`Creating new participant for user ${username} (${userId}) in org ${orgId}`);
        
        const { data: newParticipant, error } = await this.supabase
          .from('participants')
          .insert({
            org_id: orgId,
            tg_user_id: userId,
            username: username,
            full_name: fullName,
            identity_id: identityId,
            last_activity_at: new Date().toISOString()
          })
          .select('id')
          .single();
        
        if (error) {
          console.error('Error creating participant from message:', error);
        } else {
          participantId = newParticipant.id;
          console.log(`Created new participant with ID ${participantId}`);
        }
      } else {
        participantId = participant.merged_into || participant.id;
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
            
            console.log(`Reactivated participant ${participantId} in group ${chatId}`);
          }
        } else {
          // Если связи нет, создаем
          await this.supabase
            .from('participant_groups')
            .insert({
              participant_id: participantId,
              tg_group_id: chatId,
              joined_at: new Date().toISOString(),
              is_active: true
            });
          
          console.log(`Added participant ${participantId} to group ${chatId}`);
          
          // Обновляем счетчик участников в группе
          await this.supabase
            .from('telegram_groups')
            .update({
              member_count: this.supabase.rpc('increment_counter', { row_id: chatId })
            })
            .eq('tg_chat_id', chatId);
        }
      }
    } catch (error) {
      console.error('Error processing participant data:', error);
    }
    
    // Записываем событие сообщения
    try {
      await this.writeGlobalActivityEvent({
        tg_chat_id: chatId,
        identity_id: identityId,
        tg_user_id: userId,
        event_type: 'message',
        created_at: new Date().toISOString(),
        message_id: message.message_id,
        reply_to_message_id: message.reply_to_message?.message_id,
        meta: {
          user: {
            username: username,
            name: fullName
          },
          message_length: message.text?.length || 0,
          links_count: linksCount,
          mentions_count: mentionsCount,
          has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
          message_id: message.message_id
        }
      });

      console.log('Inserting activity event with data:', {
        org_id: orgId,
        event_type: 'message',
        tg_chat_id: chatId,
        message_id: message.message_id
      });
      
      // Минимальный набор полей для вставки
      const baseEventData = {
        org_id: orgId,
        event_type: 'message',
        tg_user_id: userId,
        tg_chat_id: chatId,
        meta: {
          user: {
            username: username,
            name: fullName
          },
          message_length: message.text?.length || 0,
          links_count: linksCount,
          mentions_count: mentionsCount,
          has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
          message_id: message.message_id
        }
      };
      
      // Пробуем добавить дополнительные поля, если они существуют в таблице
      try {
        // Сначала пробуем вставить только базовые поля
        const { error } = await this.supabase.from('activity_events').insert(baseEventData);
        
        if (error) {
          console.error('Error inserting activity event with base data:', error);
          throw error;
        } else {
          console.log('Activity event recorded successfully with base data');
        }
      } catch (baseError) {
        console.error('Error in base insert, trying with minimal fields:', baseError);
        
        // Если не получилось, пробуем с минимальным набором полей
        const minimalEventData = {
          org_id: orgId,
          event_type: 'message',
          tg_user_id: userId,
          tg_chat_id: chatId,
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
            console.error('Error inserting activity event with minimal data:', minimalError);
          } else {
            console.log('Activity event recorded successfully with minimal data');
          }
        } catch (minimalInsertError) {
          console.error('Fatal error inserting activity event:', minimalInsertError);
        }
      }
    } catch (error) {
      console.error('Exception in activity event insert:', error);
    }
    
    try {
      // Обновляем время последней активности пользователя
      await this.supabase
        .from('participants')
        .update({ last_activity_at: new Date().toISOString(), identity_id: participantId })
        .eq('tg_user_id', userId)
        .eq('org_id', orgId);
      
      // Обновляем время последней активности группы
      await this.supabase
        .from('telegram_groups')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('tg_chat_id', chatId);
        
      console.log('Last activity updated successfully');
    } catch (error) {
      console.error('Error updating last activity:', error);
    }
  }
  
  /**
   * Обрабатывает изменение статуса участника в группе
   */
  private async processChatMemberUpdate(update: TelegramChatMemberUpdate): Promise<void> {
    const chatId = update.chat.id;

    if (update.new_chat_member?.user?.id === 1087968824 || update.new_chat_member?.user?.username === 'GroupAnonymousBot') {
      console.log('Skipping chat member update for GroupAnonymousBot');
      return;
    }

    const orgIds = await this.getOrgIdsForChat(chatId);

    if (orgIds.length === 0) {
      console.log(`Member update from unmapped group ${chatId}, skipping`);
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
      console.log('Skipping join request for GroupAnonymousBot');
      return;
    }

    const orgIds = await this.getOrgIdsForChat(chatId);

    if (orgIds.length === 0) {
      console.log(`Join request from unmapped group ${chatId}, skipping`);
      return;
    }

    const userId = request.from.id;

    for (const orgId of orgIds) {
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
    }
  }
  
  /**
   * Обрабатывает callback-запрос (нажатие на кнопку)
   */
  private async processCallbackQuery(query: any): Promise<void> {
    if (!query.message) return;
    const chatId = query.message.chat.id;

    if (query.from?.id === 1087968824 || query.from?.username === 'GroupAnonymousBot') {
      console.log('Skipping callback query for GroupAnonymousBot');
      return;
    }

    const orgIds = await this.getOrgIdsForChat(chatId);

    if (orgIds.length === 0) {
      console.log(`Callback query from unmapped group ${chatId}, skipping`);
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
    console.log(`Updating metrics for group ${chatId} in org ${orgId}`);
    
    // Сначала проверяем, существует ли таблица group_metrics
    try {
      // Проверяем существование таблицы group_metrics
      const { data: tableCheck, error: tableError } = await this.supabase
        .from('group_metrics')
        .select('id')
        .limit(1);
        
      if (tableError) {
        console.error('Error checking group_metrics table:', tableError);
        console.log('Skipping metrics update - table might not exist yet');
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
        console.error('Error fetching today metrics:', metricsError);
        return;
      }
      
      console.log('Existing metrics for today:', todayMetrics);
      
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
          console.error('Error counting messages:', messageError);
        } else {
          messageCount = count || 0;
        }
      } catch (error) {
        console.error('Exception counting messages:', error);
      }
      
      console.log('Message count for today:', messageCount);
      
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
          console.error('Error counting replies:', replyError);
        } else {
          replyCount = count || 0;
        }
      } catch (error) {
        console.error('Exception counting replies:', error);
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
          console.error('Error counting joins:', joinError);
        } else {
          joinCount = count || 0;
        }
      } catch (error) {
        console.error('Exception counting joins:', error);
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
          console.error('Error counting leaves:', leaveError);
        } else {
          leaveCount = count || 0;
        }
      } catch (error) {
        console.error('Exception counting leaves:', error);
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
          console.error('Error counting DAU:', dauError);
        } else {
          dau = uniqueUsers ? new Set(uniqueUsers.map(u => u.tg_user_id)).size : 0;
        }
      } catch (error) {
        console.error('Exception counting DAU:', error);
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
      
      console.log('Metrics data to save:', metricsData);
      
      if (todayMetrics) {
        // Обновляем существующую запись
        const { error: updateError } = await this.supabase
          .from('group_metrics')
          .update(metricsData)
          .eq('id', todayMetrics.id);
          
        if (updateError) {
          console.error('Error updating metrics:', updateError);
        } else {
          console.log('Group metrics updated successfully');
        }
      } else {
        // Создаем новую запись
        const { error: insertError } = await this.supabase
          .from('group_metrics')
          .insert(metricsData);
          
        if (insertError) {
          console.error('Error inserting metrics:', insertError);
        } else {
          console.log('Group metrics created successfully');
        }
      }
    } catch (error) {
      console.error('Exception in updateGroupMetrics:', error);
    }
  }

  private async ensureIdentity(user: any): Promise<string | null> {
    if (!user?.id) {
      return null;
    }

    const tgUserId = Number(user.id);
    if (!Number.isFinite(tgUserId)) {
      return null;
    }

    const username = user.username || null;
    const firstName = user.first_name || null;
    const lastName = user.last_name || null;

    const { data: existingIdentity } = await this.supabase
      .from('telegram_identities')
      .select('id')
      .eq('tg_user_id', tgUserId)
      .maybeSingle();

    if (existingIdentity) {
      return existingIdentity.id;
    }

    const { data: newIdentity, error } = await this.supabase
      .from('telegram_identities')
      .insert({
        tg_user_id: tgUserId,
        username,
        first_name: firstName,
        last_name: lastName,
        raw: user
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create telegram identity:', error);
      return null;
    }

    return newIdentity?.id ?? null;
  }

  private async writeGlobalActivityEvent(payload: {
    tg_chat_id: number;
    identity_id: string | null;
    tg_user_id: number;
    event_type: string;
    created_at: string;
    message_id?: number | null;
    reply_to_message_id?: number | null;
    meta?: Record<string, any>;
  }): Promise<void> {
    if (!payload.identity_id) {
      return;
    }

    const insertPayload = {
      tg_chat_id: payload.tg_chat_id,
      identity_id: payload.identity_id,
      tg_user_id: payload.tg_user_id,
      event_type: payload.event_type,
      created_at: payload.created_at,
      message_id: payload.message_id ?? null,
      reply_to_message_id: payload.reply_to_message_id ?? null,
      meta: payload.meta ?? null
    };

    const { error } = await this.supabase
      .from('telegram_activity_events')
      .insert(insertPayload);

    if (error) {
      console.error('Failed to write global activity event:', error);
    }
  }
}

/**
 * Создает экземпляр сервиса обработки событий
 */
export function createEventProcessingService() {
  return new EventProcessingService();
}
