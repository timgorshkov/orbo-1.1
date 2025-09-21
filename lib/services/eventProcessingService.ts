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

    try {
      // Проверяем, существует ли группа с использованием строкового сравнения
      const { data: groups } = await this.supabase
        .from('telegram_groups')
        .select('id, org_id, analytics_enabled')
        .filter('tg_chat_id::text', 'eq', String(chatId))
        .limit(1);
      
      console.log('Group lookup result with string comparison:', groups);
      
      if (groups && groups.length > 0) {
        // Группа найдена
        console.log('Found group, processing message with group data:', groups[0]);
        return this.processMessageWithGroup(message, groups[0]);
      }
      
      // Если группа не найдена, но это группа/супергруппа, пробуем добавить
      if (message.chat.type === 'supergroup' || message.chat.type === 'group') {
        // Получаем любую организацию
        const { data: orgs } = await this.supabase
          .from('organizations')
          .select('id')
          .limit(1);
        
        if (orgs && orgs.length > 0) {
          const orgId = orgs[0].id;
          const title = message.chat.title || `Group ${chatId}`;
          
          // Добавляем группу
          const { data: newGroup, error } = await this.supabase
            .from('telegram_groups')
            .insert({
              org_id: orgId,
              tg_chat_id: chatId,
              title: title,
              bot_status: 'connected',
              analytics_enabled: true,
              last_sync_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (!error && newGroup) {
            console.log(`Auto-added group in processMessage: ${title} (${chatId})`);
            // Продолжаем обработку с новой группой
            return this.processMessageWithGroup(message, newGroup);
          }
        }
        
        console.log(`Message from unknown group ${chatId}, skipping`);
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
        .select('id')
        .eq('tg_user_id', member.id)
        .eq('org_id', orgId)
        .single();
      
      if (participant) {
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
        // Проверяем, есть ли участник в базе
        let participantId;
        const { data: participant } = await this.supabase
          .from('participants')
          .select('id')
          .eq('tg_user_id', member.id)
          .eq('org_id', orgId)
          .single();
        
        // Если нет, создаем запись
        if (!participant) {
          const { data: newParticipant, error } = await this.supabase
            .from('participants')
            .insert({
              org_id: orgId,
              tg_user_id: member.id,
              username: member.username,
              full_name: `${member.first_name} ${member.last_name || ''}`.trim(),
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
          participantId = participant.id;
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

  private async processMessageWithGroup(message: TelegramMessage, groupData: any): Promise<void> {
    const chatId = message.chat.id;
    const orgId = groupData.org_id;

    console.log('Processing message with group:', groupData);
    console.log('Message data:', { 
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
      // Проверяем наличие участника
      const { data: participant } = await this.supabase
        .from('participants')
        .select('id')
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
        participantId = participant.id;
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
        .update({ last_activity_at: new Date().toISOString() })
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
    
    // Получаем информацию о группе из базы данных
    const { data: groupData } = await this.supabase
      .from('telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', chatId)
      .single();
    
    if (!groupData) {
      console.log(`Member update from unknown group ${chatId}, skipping`);
      return;
    }
    
    const orgId = groupData.org_id;
    const userId = update.new_chat_member.user.id;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    
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
    }
    
    // Обновляем счетчики и статистику
    await this.updateGroupMetrics(orgId, chatId);
  }
  
  /**
   * Обрабатывает изменение статуса бота в группе
   */
  private async processMyBotStatusUpdate(update: TelegramChatMemberUpdate): Promise<void> {
    const chatId = update.chat.id;
    const newStatus = update.new_chat_member.status;
    
    // Проверяем, существует ли группа в базе
    const { data: groupData } = await this.supabase
      .from('telegram_groups')
      .select('id, org_id')
      .eq('tg_chat_id', chatId)
      .single();
    
    // Если бот стал администратором
    if (newStatus === 'administrator') {
      if (groupData) {
        // Обновляем статус существующей группы
        await this.supabase
          .from('telegram_groups')
          .update({
            bot_status: 'connected',
            last_sync_at: new Date().toISOString()
          })
          .eq('id', groupData.id);
      } else {
        // Группа неизвестна, получаем информацию о ней
        const telegramService = createTelegramService();
        const chatInfo = await telegramService.getChat(chatId);
        
        if (chatInfo?.result) {
          // Пока не привязываем к организации, это будет сделано позже
          // через checkStatus или addGroupManually
          console.log(`Bot added as admin to new group ${chatId}, title: ${chatInfo.result.title}`);
        }
      }
    }
    
    // Если бот был удален из группы
    if (newStatus === 'left' || newStatus === 'kicked') {
      if (groupData) {
        // Обновляем статус группы
        await this.supabase
          .from('telegram_groups')
          .update({
            bot_status: 'inactive',
            last_sync_at: new Date().toISOString()
          })
          .eq('id', groupData.id);
      }
    }
  }
  
  /**
   * Обрабатывает запрос на вступление в группу
   */
  private async processChatJoinRequest(request: any): Promise<void> {
    const chatId = request.chat.id;
    
    // Получаем информацию о группе из базы данных
    const { data: groupData } = await this.supabase
      .from('telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', chatId)
      .single();
    
    if (!groupData) {
      console.log(`Join request from unknown group ${chatId}, skipping`);
      return;
    }
    
    const orgId = groupData.org_id;
    const userId = request.from.id;
    
    // Записываем событие запроса на вступление
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
  
  /**
   * Обрабатывает callback-запрос (нажатие на кнопку)
   */
  private async processCallbackQuery(query: any): Promise<void> {
    if (!query.message) return;
    
    const chatId = query.message.chat.id;
    
    // Получаем информацию о группе из базы данных
    const { data: groupData } = await this.supabase
      .from('telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', chatId)
      .single();
    
    if (!groupData) {
      console.log(`Callback query from unknown group ${chatId}, skipping`);
      return;
    }
    
    const orgId = groupData.org_id;
    const userId = query.from.id;
    
    // Записываем событие callback
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
    
    // Обновляем время последней активности пользователя
    await this.supabase
      .from('participants')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('tg_user_id', userId)
      .eq('org_id', orgId);
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
}

/**
 * Создает экземпляр сервиса обработки событий
 */
export function createEventProcessingService() {
  return new EventProcessingService();
}
