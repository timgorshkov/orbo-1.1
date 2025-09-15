/**
 * Сервис для взаимодействия с Telegram Bot API
 */
export class TelegramService {
  private apiBase = 'https://api.telegram.org/bot';
  private token: string;

  constructor(token = process.env.TELEGRAM_BOT_TOKEN) {
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN not provided');
    }
    this.token = token;
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
      allowed_updates: ['message', 'my_chat_member', 'chat_member']
    });
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
   * Создание ссылки-приглашения для группы
   */
  async createChatInviteLink(chatId: number, options: any = {}) {
    return this.callApi('createChatInviteLink', {
      chat_id: chatId,
      ...options
    });
  }
  // Добавьте этот метод в класс TelegramService
  async getUpdates() {
    const url = `https://api.telegram.org/bot${this.token}/getUpdates`
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error getting Telegram updates:', error)
      return null
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
export function createTelegramService() {
  return new TelegramService();
}
