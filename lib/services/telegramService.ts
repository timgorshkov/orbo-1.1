/**
 * Сервис для взаимодействия с Telegram Bot API
 */
export class TelegramService {
  private apiBase = 'https://api.telegram.org/bot';
  private token: string;
  private botType: 'main' | 'notifications';

  constructor(botType: 'main' | 'notifications' = 'main') {
    this.botType = botType;
    
    // Выбираем токен в зависимости от типа бота
    const token = botType === 'main' 
      ? process.env.TELEGRAM_BOT_TOKEN 
      : process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;
      
    if (!token) {
      throw new Error(`${botType === 'main' ? 'TELEGRAM_BOT_TOKEN' : 'TELEGRAM_NOTIFICATIONS_BOT_TOKEN'} not provided`);
    }
    
    this.token = token;
    console.log(`TelegramService initialized for ${botType} bot with token: ${token.substring(0, 5)}...`);
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
      allowed_updates: ['message', 'my_chat_member', 'chat_member', 'chat_join_request', 'callback_query', 'message_reaction']
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
        console.log('Deleting webhook before getting updates...');
        const deleteResult = await this.callApi('deleteWebhook');
        if (!deleteResult.ok) {
          console.error('Failed to delete webhook:', deleteResult);
          throw new Error(`Failed to delete webhook: ${deleteResult.description || 'Unknown error'}`);
        }
        console.log('Webhook deleted successfully');
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
      console.error('Error getting Telegram updates:', error);
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
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API Error: ${errorData.description || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error calling Telegram API (${method}):`, error);
      throw error;
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
