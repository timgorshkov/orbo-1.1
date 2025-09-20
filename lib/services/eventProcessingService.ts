import { createClientServer } from '@/lib/server/supabaseServer';
import { TelegramUpdate, TelegramMessage, TelegramUser, TelegramChatMemberUpdate } from './telegramService';
import { createTelegramService } from './telegramService';

/**
 * Сервис для обработки и нормализации событий Telegram
 */
export class EventProcessingService {
  private supabase;
  
  constructor() {
    this.supabase = createClientServer();
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
      const { count: testConnection, error: connectionError } = await this.supabase
        .from('telegram_groups')
        .select('*', { count: 'exact', head: true });
      
      console.log('Database connection test:', testConnection, 'Error:', connectionError);
      
      if (connectionError) {
        console.error('Database connection error:', connectionError);
        return;
      }
    } catch (connErr) {
      console.error('Failed to connect to database:', connErr);
      return;
    }
  
    try {
      // Проверяем, существует ли группа с использованием строкового сравнения
      console.log('Searching for group with tg_chat_id:', chatId, 'Type:', typeof chatId);

      // Попробуем несколько вариантов поиска
      const { data: groups1 } = await this.supabase
        .from('telegram_groups')
        .select('id, org_id, analytics_enabled')
        .eq('tg_chat_id', chatId);

      console.log('Search result with direct match:', groups1);

      const { data: groups2 } = await this.supabase
        .from('telegram_groups')
        .select('id, org_id, analytics_enabled')
        .eq('tg_chat_id', String(chatId));

      console.log('Search result with string conversion:', groups2);

      // Используем текстовый фильтр
      const { data: groups3 } = await this.supabase
        .from('telegram_groups')
        .select('id, org_id, analytics_enabled')
        .filter('tg_chat_id::text', 'eq', String(chatId));

      console.log('Search result with text filter:', groups3);

      // Используем любой из результатов, который не пустой
      const groups = groups1?.length ? groups1 : 
                    groups2?.length ? groups2 : 
                    groups3?.length ? groups3 : null;
      
      console.log('Group lookup result with string comparison:', groups);
      
      if (groups && groups.length > 0) {
        // Группа найдена
        return this.processMessageWithGroup(message, groups[0]);
      }
      
      // В методе processMessage, после проверки типа чата:
      if (message.chat.type === 'supergroup' || message.chat.type === 'group') {
        const chatId = message.chat.id;
        const title = message.chat.title || `Group ${chatId}`;
        
        // Получаем любую организацию
        const { data: orgs } = await this.supabase
          .from('organizations')
          .select('id')
          .limit(1);
        
        if (orgs && orgs.length > 0) {
          const orgId = orgs[0].id;
          
          // Принудительно добавляем группу, игнорируя ошибки уникальности
          console.log(`Force inserting group ${title} (${chatId}) for org ${orgId}`);
          
          try {
            // Используем upsert для обновления или вставки
            const { data: upsertResult, error: upsertError } = await this.supabase
              .from('telegram_groups')
              .upsert({
                org_id: orgId,
                tg_chat_id: chatId,
                title: title,
                bot_status: 'connected',
                analytics_enabled: true,
                last_sync_at: new Date().toISOString()
              }, {
                onConflict: 'tg_chat_id',
                ignoreDuplicates: false
              })
              .select();
            
            console.log('Upsert result:', upsertResult, 'Error:', upsertError);
            
            if (!upsertError) {
              // Обрабатываем сообщение
              await this.processUserMessage(message, orgId);
              
              // Обновляем метрики группы
              await this.updateGroupMetrics(orgId, chatId);
              
              return; // Выходим из метода после успешной обработки
            }
          } catch (error) {
            console.error('Error in force insert:', error);
          }
        }
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
      
      // Проверяем, есть ли участник в базе
      const { data: participant } = await this.supabase
        .from('participants')
        .select('id')
        .eq('tg_user_id', member.id)
        .eq('org_id', orgId)
        .single();
      
      // Если нет, создаем запись
      if (!participant) {
        await this.supabase.from('participants').insert({
          org_id: orgId,
          tg_user_id: member.id,
          username: member.username,
          full_name: `${member.first_name} ${member.last_name || ''}`.trim(),
          last_activity_at: new Date().toISOString()
        });
      }
    }
    
    // Обновляем счетчики и статистику
    await this.updateGroupMetrics(orgId, chatId);
  }

  private async processMessageWithGroup(message: TelegramMessage, groupData: any): Promise<void> {
    const chatId = message.chat.id;
    const orgId = groupData.org_id;
    
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
    
    // Подсчет сущностей в сообщении
    let linksCount = 0;
    let mentionsCount = 0;
    
    if (message.entities) {
      for (const entity of message.entities) {
        if (entity.type === 'url') linksCount++;
        if (entity.type === 'mention' || entity.type === 'text_mention') mentionsCount++;
      }
    }
    
    // Записываем событие сообщения
    await this.supabase.from('activity_events').insert({
      org_id: orgId,
      event_type: 'message',
      tg_user_id: userId,
      tg_chat_id: chatId,
      message_id: message.message_id,
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.reply_to_message?.message_id,
      has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
      chars_count: message.text?.length || 0,
      links_count: linksCount,
      mentions_count: mentionsCount,
      meta: {
        user: {
          username: message.from.username,
          name: `${message.from.first_name} ${message.from.last_name || ''}`.trim()
        }
      }
    });
    
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
    const today = new Date().toISOString().split('T')[0];
    
    // Получаем метрики за сегодня
    const { data: todayMetrics } = await this.supabase
      .from('group_metrics')
      .select('id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('date', today)
      .single();
    
    // Получаем количество сообщений за сегодня
    const { count: messageCount } = await this.supabase
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('event_type', 'message')
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`);
    
    // Получаем количество ответов за сегодня
    const { count: replyCount } = await this.supabase
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('event_type', 'message')
      .not('reply_to_message_id', 'is', null)
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`);
    
    // Получаем количество присоединений за сегодня
    const { count: joinCount } = await this.supabase
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('event_type', 'join')
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`);
    
    // Получаем количество выходов за сегодня
    const { count: leaveCount } = await this.supabase
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('event_type', 'leave')
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`);
    
    // Получаем количество уникальных пользователей за сегодня (DAU)
    const { data: uniqueUsers } = await this.supabase
      .from('activity_events')
      .select('tg_user_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .in('event_type', ['message', 'reaction', 'callback'])
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`);
    
    const dau = new Set(uniqueUsers?.map(u => u.tg_user_id)).size;
    
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
      await this.supabase
        .from('group_metrics')
        .update(metricsData)
        .eq('id', todayMetrics.id);
    } else {
      // Создаем новую запись
      await this.supabase
        .from('group_metrics')
        .insert(metricsData);
    }
  }
}

/**
 * Создает экземпляр сервиса обработки событий
 */
export function createEventProcessingService() {
  return new EventProcessingService();
}
