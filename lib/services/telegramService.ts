/**
 * Сервис для взаимодействия с Telegram Bot API
 */
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('TelegramService');

export class TelegramService {
  private apiBase = 'https://api.telegram.org/bot';
  private token: string;
  private botType: 'main' | 'notifications' | 'event';

  constructor(botType: 'main' | 'notifications' | 'event' = 'main') {
    this.botType = botType;
    
    // Выбираем токен в зависимости от типа бота
    let token: string | undefined;
    switch (botType) {
      case 'main':
        token = process.env.TELEGRAM_BOT_TOKEN;
        break;
      case 'notifications':
        token = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;
        break;
      case 'event':
        token = process.env.TELEGRAM_EVENT_BOT_TOKEN;
        break;
    }
      
    if (!token) {
      throw new Error(`Token not provided for bot type: ${botType}`);
    }
    
    this.token = token;
    logger.debug({ bot_type: botType, token_prefix: token.substring(0, 5) }, 'TelegramService initialized');
  }

  /**
   * Отправляет сообщение в чат Telegram
   */
  async sendMessage(chatId: number, text: string, options: any = {}) {
    return this.callApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...options
    });
  }

  /**
   * Установка webhook для бота
   */
  async setWebhook(url: string, secretToken: string) {
    return this.callApi('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'message_reaction', 'message_reaction_count', 'my_chat_member', 'chat_member', 'chat_join_request']
    });
  }

  /**
   * Установка webhook с расширенными параметрами
   */
  async setWebhookAdvanced(params: {
    url: string;
    secret_token?: string;
    allowed_updates?: string[];
    drop_pending_updates?: boolean;
    max_connections?: number;
  }) {
    return this.callApi('setWebhook', params);
  }

  /**
   * Получение информации о webhook
   */
  async getWebhookInfo() {
    return this.callApi('getWebhookInfo', {});
  }

  /**
   * Получение информации о боте
   */
  async getMe() {
    return this.callApi('getMe');
  }

  /**
   * Получение информации о чате
   */
  async getChat(chatId: number) {
    return this.callApi('getChat', { chat_id: chatId });
  }

  /**
   * Получение информации об участниках группы
   */
  async getChatMembersCount(chatId: number) {
    return this.callApi('getChatMemberCount', { chat_id: chatId });
  }

  /**
   * Одобрить запрос на вступление в группу
   */
  async approveChatJoinRequest(chatId: number, userId: number) {
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      method: 'approveChatJoinRequest'
    }, '📞 [TG-SERVICE] Calling Telegram API approveChatJoinRequest');
    
    const result = await this.callApi('approveChatJoinRequest', {
      chat_id: chatId,
      user_id: userId
    });
    
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      ok: result.ok,
      error_code: result.error_code,
      description: result.description
    }, result.ok ? '✅ [TG-SERVICE] approveChatJoinRequest succeeded' : '❌ [TG-SERVICE] approveChatJoinRequest failed');
    
    return result;
  }

  /**
   * Отклонить запрос на вступление в группу
   */
  async declineChatJoinRequest(chatId: number, userId: number) {
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      method: 'declineChatJoinRequest'
    }, '📞 [TG-SERVICE] Calling Telegram API declineChatJoinRequest');
    
    const result = await this.callApi('declineChatJoinRequest', {
      chat_id: chatId,
      user_id: userId
    });
    
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      ok: result.ok,
      error_code: result.error_code,
      description: result.description
    }, result.ok ? '✅ [TG-SERVICE] declineChatJoinRequest succeeded' : '❌ [TG-SERVICE] declineChatJoinRequest failed');
    
    return result;
  }

  /**
   * Забанить пользователя в чате
   */
  async banChatMember(chatId: number, userId: number, untilDate?: number) {
    return this.callApi('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate
    });
  }

  /**
   * Разбанить пользователя в чате
   */
  async unbanChatMember(chatId: number, userId: number, onlyIfBanned: boolean = true) {
    return this.callApi('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: onlyIfBanned
    });
  }

  /**
   * Ограничить права пользователя в чате
   */
  async restrictChatMember(chatId: number, userId: number, permissions: any, untilDate?: number) {
    return this.callApi('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      until_date: untilDate
    });
  }

  async getAllChats() {
    // Получаем все обновления
    const updates = await this.getUpdates()
    
    if (!updates?.result) {
      return []
    }
    
    // Извлекаем уникальные ID чатов
    const chatIds = new Set<number>()
    
    updates.result.forEach((update: any) => {
      if (update.message?.chat?.id) {
        chatIds.add(update.message.chat.id)
      }
    })
    
    return Array.from(chatIds)
  }

/**
 * Получение информации о члене чата
 */
async getChatMember(chatId: number, userId: number) {
  return this.callApi('getChatMember', { 
    chat_id: chatId,
    user_id: userId
  });
}

  /**
   * Получение списка всех администраторов группы
   */
  async getChatAdministrators(chatId: number) {
    return this.callApi('getChatAdministrators', {
      chat_id: chatId
    });
  }

  /**
   * Создание ссылки-приглашения для группы
   */
  async createChatInviteLink(chatId: number, options: any = {}) {
    return this.callApi('createChatInviteLink', {
      chat_id: chatId,
      ...options
    });
  }

  /**
   * Получение обновлений бота
   */
  async getUpdates(options: { offset?: number, limit?: number, timeout?: number, deleteWebhook?: boolean } = {}) {
    try {
      // Если установлен флаг deleteWebhook, сначала удаляем вебхук
      if (options.deleteWebhook) {
        logger.debug({}, 'Deleting webhook before getting updates');
        const deleteResult = await this.callApi('deleteWebhook');
        if (!deleteResult.ok) {
          logger.error({ error: deleteResult.description || 'Unknown error' }, 'Failed to delete webhook');
          throw new Error(`Failed to delete webhook: ${deleteResult.description || 'Unknown error'}`);
        }
        logger.debug({}, 'Webhook deleted successfully');
      }
      
      // Добавляем параметры запроса
      const params = new URLSearchParams();
      if (options.offset !== undefined) params.append('offset', options.offset.toString());
      if (options.limit !== undefined) params.append('limit', options.limit.toString());
      if (options.timeout !== undefined) params.append('timeout', options.timeout.toString());
      
      // Вызываем API через общий метод callApi
      return await this.callApi('getUpdates', options.offset !== undefined || options.limit !== undefined || options.timeout !== undefined ? 
        { 
          offset: options.offset, 
          limit: options.limit, 
          timeout: options.timeout 
        } : {});
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Error getting Telegram updates');
      throw error; // Пробрасываем ошибку дальше для обработки
    }
  }

  /**
   * Отправка опроса в чат
   */
  async sendPoll(chatId: number, question: string, options: string[], pollOptions: any = {}) {
    return this.callApi('sendPoll', {
      chat_id: chatId,
      question,
      options,
      ...pollOptions
    });
  }

  /**
   * Отправка уведомления пользователю (для бота уведомлений)
   */
  async sendNotification(userId: number, text: string, options: any = {}) {
    if (this.botType !== 'notifications') {
      throw new Error('This method is only available for notification bots');
    }
    return this.sendMessage(userId, text, options);
  }

  /**
   * Отправка приветственного сообщения новому участнику группы
   */
  async sendWelcomeMessage(chatId: number, userId: number, welcomeText: string) {
    const mentionText = `<a href="tg://user?id=${userId}">Пользователь</a>`;
    const message = welcomeText.replace('{user}', mentionText);
    
    return this.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      disable_notification: false
    });
  }

  /**
   * Отправка файла или медиа в чат
   */
  async sendDocument(chatId: number, fileUrl: string, caption?: string) {
    return this.callApi('sendDocument', {
      chat_id: chatId,
      document: fileUrl,
      caption: caption || '',
      parse_mode: 'HTML'
    });
  }

  /**
   * Удаление сообщения из чата
   */
  async deleteMessage(chatId: number, messageId: number) {
    return this.callApi('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  /**
   * Получение фотографий профиля пользователя
   */
  async getUserProfilePhotos(userId: number, offset: number = 0, limit: number = 1) {
    return this.callApi('getUserProfilePhotos', {
      user_id: userId,
      offset,
      limit
    });
  }

  /**
   * Получение информации о файле для скачивания
   */
  async getFile(fileId: string) {
    return this.callApi('getFile', {
      file_id: fileId
    });
  }

  /**
   * Получение URL для скачивания файла
   */
  getFileUrl(filePath: string): string {
    return `https://api.telegram.org/file/bot${this.token}/${filePath}`;
  }

  /**
   * Скачивание и возврат буфера файла
   */
  async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const url = this.getFileUrl(filePath);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    
    return await response.arrayBuffer();
  }

  /**
   * Общий метод для вызова Telegram API
   */
  private async callApi(method: string, params: any = {}) {
    const url = `${this.apiBase}${this.token}/${method}`;
    
    // Log critical methods like join request approval
    const criticalMethods = ['approveChatJoinRequest', 'declineChatJoinRequest'];
    if (criticalMethods.includes(method)) {
      logger.info({
        bot_type: this.botType,
        method,
        params,
        url_masked: `${this.apiBase}***/${method}`
      }, '🔧 [TG-API] Calling critical Telegram method');
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const responseData = await response.json();
      
      if (criticalMethods.includes(method)) {
        logger.info({
          bot_type: this.botType,
          method,
          ok: responseData.ok,
          error_code: responseData.error_code,
          description: responseData.description,
          http_status: response.status
        }, '📥 [TG-API] Telegram API response received');
      }

      if (!response.ok || !responseData.ok) {
        // Check if this is an expected/normal error (don't log as ERROR)
        const isExpectedError = 
          (responseData.error_code === 400 && responseData.description?.includes('user not found')) ||
          (responseData.error_code === 400 && responseData.description?.includes('chat not found')) ||
          (responseData.error_code === 403 && responseData.description?.includes('bot was blocked')) ||
          (responseData.error_code === 403 && responseData.description?.includes('user is deactivated'));

        if (isExpectedError) {
          logger.warn({
            bot_type: this.botType,
            method,
            params,
            http_status: response.status,
            ok: responseData.ok,
            error_code: responseData.error_code,
            description: responseData.description
          }, '⚠️ [TG-API] Expected Telegram API error (user/chat unavailable)');
        } else {
          logger.error({
            bot_type: this.botType,
            method,
            params,
            http_status: response.status,
            ok: responseData.ok,
            error_code: responseData.error_code,
            description: responseData.description
          }, '❌ [TG-API] Telegram API returned error');
        }
        
        // Return error response instead of throwing
        return {
          ok: false,
          error_code: responseData.error_code,
          description: responseData.description || response.statusText
        };
      }

      return responseData;
    } catch (error: any) {
      // Gracefully handle expected errors (don't log as ERROR)
      const errorMessage = error?.message || String(error);
      const isExpectedError = 
        errorMessage.includes('user not found') ||
        errorMessage.includes('chat not found') ||
        errorMessage.includes('USER_DELETED') ||
        errorMessage.includes('bot was blocked') ||
        errorMessage.includes('upgraded to a supergroup') ||
        errorMessage.includes('was kicked') ||
        errorMessage.includes('PEER_ID_INVALID');
      
      if (isExpectedError) {
        // Log as info for expected errors (common Telegram API responses)
        logger.debug({ method, error: errorMessage }, 'Expected Telegram API response');
      } else {
        // Log as error for unexpected issues
        logger.error({ 
          method,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        }, 'Error calling Telegram API');
      }
      
      // Return error response format
      return {
        ok: false,
        error_code: 500,
        description: errorMessage
      };
    }
  }
}

/**
 * Создает экземпляр сервиса Telegram с настройками по умолчанию
 */
export function createTelegramService(botType: 'main' | 'notifications' = 'main') {
  return new TelegramService(botType);
}

/**
 * Интерфейсы для типизации Telegram-обновлений
 */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  chat_member?: TelegramChatMemberUpdate;
  my_chat_member?: TelegramChatMemberUpdate;
  chat_join_request?: TelegramChatJoinRequest;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  reply_to_message?: TelegramMessage;
  text?: string;
  entities?: TelegramMessageEntity[];
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  new_chat_title?: string;
  message_thread_id?: number;
  reply_to_message_id?: number;
  // Добавьте эти поля для медиа-контента
  photo?: any[];
  video?: any;
  document?: any;
  audio?: any;
  voice?: any;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
}

export interface TelegramChatMemberUpdate {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
}

export interface TelegramChatMember {
  user: TelegramUser;
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
}

export interface TelegramChatJoinRequest {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  bio?: string;
  invite_link?: TelegramChatInviteLink;
}

export interface TelegramChatInviteLink {
  invite_link: string;
  creator: TelegramUser;
  creates_join_request: boolean;
  is_primary: boolean;
  is_revoked: boolean;
  name?: string;
  expire_date?: number;
  member_limit?: number;
  pending_join_request_count?: number;
}
