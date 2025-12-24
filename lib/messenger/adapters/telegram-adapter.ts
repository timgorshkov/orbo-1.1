/**
 * Адаптер для Telegram Bot API
 * 
 * Реализует интерфейс MessengerAdapter для платформы Telegram.
 * Оборачивает существующий TelegramService для обратной совместимости.
 */

import { BaseMessengerAdapter } from '../adapter';
import type {
  MessengerPlatform,
  MessengerUser,
  MessengerChat,
  MessengerChatMember,
  MessengerMessage,
  SendMessageOptions,
  WebhookInfo,
  ApiResult,
  ChatMemberStatus,
  ChatType,
} from '../types';

// Типы Telegram API
interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  description?: string;
  photo?: { small_file_id: string };
  invite_link?: string;
}

interface TelegramChatMember {
  user: TelegramUser;
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  custom_title?: string;
  can_delete_messages?: boolean;
  can_restrict_members?: boolean;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
}

export class TelegramAdapter extends BaseMessengerAdapter {
  readonly platform: MessengerPlatform = 'telegram';
  readonly platformName = 'Telegram';
  
  private apiBase = 'https://api.telegram.org/bot';

  constructor(token: string) {
    super(token, 'TelegramAdapter');
  }

  /**
   * Вызов Telegram API
   */
  private async callApi<T>(method: string, params: Record<string, any> = {}): Promise<TelegramApiResponse<T>> {
    const url = `${this.apiBase}${this.token}/${method}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();
      return data as TelegramApiResponse<T>;
    } catch (error: any) {
      this.logger.error({ method, error: error.message }, 'Telegram API call failed');
      return { ok: false, description: error.message };
    }
  }

  // ============================================
  // Конвертеры Telegram -> Universal
  // ============================================

  private toMessengerUser(user: TelegramUser): MessengerUser {
    return {
      platformUserId: String(user.id),
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: [user.first_name, user.last_name].filter(Boolean).join(' '),
      isBot: user.is_bot,
      rawData: user as unknown as Record<string, unknown>,
    };
  }

  private toMessengerChat(chat: TelegramChat): MessengerChat {
    return {
      chatId: String(chat.id),
      type: chat.type as ChatType,
      title: chat.title,
      description: chat.description,
      photoUrl: undefined, // Требует отдельного запроса
      inviteLink: chat.invite_link,
      rawData: chat as unknown as Record<string, unknown>,
    };
  }

  private toMessengerChatMember(member: TelegramChatMember): MessengerChatMember {
    return {
      user: this.toMessengerUser(member.user),
      status: member.status as ChatMemberStatus,
      customTitle: member.custom_title,
      canDeleteMessages: member.can_delete_messages,
      canManageMembers: member.can_restrict_members,
      rawData: member as unknown as Record<string, unknown>,
    };
  }

  private toMessengerMessage(msg: TelegramMessage): MessengerMessage {
    return {
      messageId: String(msg.message_id),
      chatId: String(msg.chat.id),
      senderId: msg.from ? String(msg.from.id) : '',
      text: msg.text,
      replyToMessageId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
      timestamp: new Date(msg.date * 1000),
      rawData: msg as unknown as Record<string, unknown>,
    };
  }

  // ============================================
  // Реализация интерфейса MessengerAdapter
  // ============================================

  async getMe(): Promise<ApiResult<MessengerUser>> {
    const response = await this.callApi<TelegramUser>('getMe');
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to get bot info', response.error_code);
    }
    
    return this.success(this.toMessengerUser(response.result));
  }

  async getChat(chatId: string): Promise<ApiResult<MessengerChat>> {
    const response = await this.callApi<TelegramChat>('getChat', { 
      chat_id: this.parseChatId(chatId) 
    });
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to get chat', response.error_code);
    }
    
    return this.success(this.toMessengerChat(response.result));
  }

  async getChatMemberCount(chatId: string): Promise<ApiResult<number>> {
    const response = await this.callApi<number>('getChatMemberCount', { 
      chat_id: this.parseChatId(chatId) 
    });
    
    if (!response.ok || response.result === undefined) {
      return this.error(response.description || 'Failed to get member count', response.error_code);
    }
    
    return this.success(response.result);
  }

  async getChatAdministrators(chatId: string): Promise<ApiResult<MessengerChatMember[]>> {
    const response = await this.callApi<TelegramChatMember[]>('getChatAdministrators', { 
      chat_id: this.parseChatId(chatId) 
    });
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to get administrators', response.error_code);
    }
    
    return this.success(response.result.map(m => this.toMessengerChatMember(m)));
  }

  async getChatMember(chatId: string, userId: string): Promise<ApiResult<MessengerChatMember>> {
    const response = await this.callApi<TelegramChatMember>('getChatMember', { 
      chat_id: this.parseChatId(chatId),
      user_id: parseInt(userId, 10)
    });
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to get chat member', response.error_code);
    }
    
    return this.success(this.toMessengerChatMember(response.result));
  }

  async sendMessage(
    chatId: string, 
    text: string, 
    options: SendMessageOptions = {}
  ): Promise<ApiResult<MessengerMessage>> {
    const params: Record<string, any> = {
      chat_id: this.parseChatId(chatId),
      text,
    };

    // Маппинг parse_mode
    if (options.parseMode === 'html') {
      params.parse_mode = 'HTML';
    } else if (options.parseMode === 'markdown') {
      params.parse_mode = 'MarkdownV2';
    }

    if (options.replyToMessageId) {
      params.reply_to_message_id = parseInt(options.replyToMessageId, 10);
    }

    if (options.disableLinkPreview) {
      params.disable_web_page_preview = true;
    }

    if (options.disableNotification) {
      params.disable_notification = true;
    }

    if (options.inlineKeyboard) {
      params.reply_markup = {
        inline_keyboard: options.inlineKeyboard.map(row => 
          row.map(btn => ({
            text: btn.text,
            callback_data: btn.callbackData,
            url: btn.url,
            web_app: btn.webAppUrl ? { url: btn.webAppUrl } : undefined,
          }))
        )
      };
    }

    const response = await this.callApi<TelegramMessage>('sendMessage', params);
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to send message', response.error_code);
    }
    
    return this.success(this.toMessengerMessage(response.result));
  }

  async editMessage(
    chatId: string, 
    messageId: string, 
    text: string,
    options: SendMessageOptions = {}
  ): Promise<ApiResult<MessengerMessage>> {
    const params: Record<string, any> = {
      chat_id: this.parseChatId(chatId),
      message_id: parseInt(messageId, 10),
      text,
    };

    if (options.parseMode === 'html') {
      params.parse_mode = 'HTML';
    } else if (options.parseMode === 'markdown') {
      params.parse_mode = 'MarkdownV2';
    }

    if (options.inlineKeyboard) {
      params.reply_markup = {
        inline_keyboard: options.inlineKeyboard.map(row => 
          row.map(btn => ({
            text: btn.text,
            callback_data: btn.callbackData,
            url: btn.url,
          }))
        )
      };
    }

    const response = await this.callApi<TelegramMessage>('editMessageText', params);
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to edit message', response.error_code);
    }
    
    return this.success(this.toMessengerMessage(response.result));
  }

  async deleteMessage(chatId: string, messageId: string): Promise<ApiResult<boolean>> {
    const response = await this.callApi<boolean>('deleteMessage', {
      chat_id: this.parseChatId(chatId),
      message_id: parseInt(messageId, 10)
    });
    
    if (!response.ok) {
      return this.error(response.description || 'Failed to delete message', response.error_code);
    }
    
    return this.success(true);
  }

  async answerCallbackQuery(
    callbackQueryId: string, 
    options: { text?: string; showAlert?: boolean } = {}
  ): Promise<ApiResult<boolean>> {
    const response = await this.callApi<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: options.text,
      show_alert: options.showAlert,
    });
    
    if (!response.ok) {
      return this.error(response.description || 'Failed to answer callback', response.error_code);
    }
    
    return this.success(true);
  }

  async getUserProfilePhotos(
    userId: string, 
    options: { offset?: number; limit?: number } = {}
  ): Promise<ApiResult<string[]>> {
    const response = await this.callApi<{ total_count: number; photos: any[][] }>('getUserProfilePhotos', {
      user_id: parseInt(userId, 10),
      offset: options.offset || 0,
      limit: options.limit || 1,
    });
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to get profile photos', response.error_code);
    }
    
    // Возвращаем file_id самых больших версий фото
    const fileIds = response.result.photos.map(photoSizes => {
      const largest = photoSizes[photoSizes.length - 1];
      return largest?.file_id;
    }).filter(Boolean);
    
    return this.success(fileIds);
  }

  async downloadFile(fileId: string): Promise<ApiResult<ArrayBuffer>> {
    // Сначала получаем путь к файлу
    const fileResponse = await this.callApi<{ file_path: string }>('getFile', {
      file_id: fileId
    });
    
    if (!fileResponse.ok || !fileResponse.result?.file_path) {
      return this.error(fileResponse.description || 'Failed to get file info');
    }
    
    // Скачиваем файл
    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${fileResponse.result.file_path}`;
    
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        return this.error(`Failed to download file: ${response.statusText}`);
      }
      return this.success(await response.arrayBuffer());
    } catch (error: any) {
      return this.error(`Download failed: ${error.message}`);
    }
  }

  async setWebhook(
    url: string, 
    options: { secretToken?: string; allowedUpdates?: string[]; dropPendingUpdates?: boolean } = {}
  ): Promise<ApiResult<boolean>> {
    const params: Record<string, any> = { url };
    
    if (options.secretToken) {
      params.secret_token = options.secretToken;
    }
    if (options.allowedUpdates) {
      params.allowed_updates = options.allowedUpdates;
    }
    if (options.dropPendingUpdates) {
      params.drop_pending_updates = true;
    }
    
    const response = await this.callApi<boolean>('setWebhook', params);
    
    if (!response.ok) {
      return this.error(response.description || 'Failed to set webhook', response.error_code);
    }
    
    return this.success(true);
  }

  async deleteWebhook(): Promise<ApiResult<boolean>> {
    const response = await this.callApi<boolean>('deleteWebhook');
    
    if (!response.ok) {
      return this.error(response.description || 'Failed to delete webhook', response.error_code);
    }
    
    return this.success(true);
  }

  async getWebhookInfo(): Promise<ApiResult<WebhookInfo>> {
    const response = await this.callApi<{
      url: string;
      has_custom_certificate: boolean;
      pending_update_count: number;
      last_error_date?: number;
      last_error_message?: string;
      max_connections?: number;
      allowed_updates?: string[];
    }>('getWebhookInfo');
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to get webhook info', response.error_code);
    }
    
    const r = response.result;
    return this.success({
      url: r.url,
      hasCustomCertificate: r.has_custom_certificate,
      pendingUpdateCount: r.pending_update_count,
      lastErrorDate: r.last_error_date ? new Date(r.last_error_date * 1000) : undefined,
      lastErrorMessage: r.last_error_message,
      maxConnections: r.max_connections,
      allowedUpdates: r.allowed_updates,
    });
  }

  async createChatInviteLink(
    chatId: string,
    options: { name?: string; expireDate?: Date; memberLimit?: number; createsJoinRequest?: boolean } = {}
  ): Promise<ApiResult<string>> {
    const params: Record<string, any> = {
      chat_id: this.parseChatId(chatId),
    };
    
    if (options.name) params.name = options.name;
    if (options.expireDate) params.expire_date = Math.floor(options.expireDate.getTime() / 1000);
    if (options.memberLimit) params.member_limit = options.memberLimit;
    if (options.createsJoinRequest) params.creates_join_request = true;
    
    const response = await this.callApi<{ invite_link: string }>('createChatInviteLink', params);
    
    if (!response.ok || !response.result) {
      return this.error(response.description || 'Failed to create invite link', response.error_code);
    }
    
    return this.success(response.result.invite_link);
  }

  // ============================================
  // Вспомогательные методы
  // ============================================

  /**
   * Парсит chat_id (может быть числом или строкой)
   */
  private parseChatId(chatId: string): number | string {
    const num = parseInt(chatId, 10);
    return isNaN(num) ? chatId : num;
  }
}

/**
 * Создать экземпляр TelegramAdapter
 */
export function createTelegramAdapter(token?: string): TelegramAdapter {
  const finalToken = token || process.env.TELEGRAM_BOT_TOKEN;
  if (!finalToken) {
    throw new Error('Telegram bot token is required');
  }
  return new TelegramAdapter(finalToken);
}

