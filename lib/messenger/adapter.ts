/**
 * Абстрактный интерфейс адаптера мессенджера
 * 
 * Все платформы (Telegram, MAX, WhatsApp) должны реализовывать этот интерфейс.
 * Это обеспечивает единообразный API для работы с разными мессенджерами.
 */

import type {
  MessengerPlatform,
  MessengerUser,
  MessengerChat,
  MessengerChatMember,
  MessengerMessage,
  SendMessageOptions,
  WebhookInfo,
  ApiResult,
} from './types';

export interface MessengerAdapter {
  // ============================================
  // Информация о платформе
  // ============================================
  
  /** Идентификатор платформы */
  readonly platform: MessengerPlatform;
  
  /** Название платформы для отображения */
  readonly platformName: string;

  // ============================================
  // Информация о боте
  // ============================================
  
  /** Получить информацию о боте */
  getMe(): Promise<ApiResult<MessengerUser>>;

  // ============================================
  // Работа с чатами
  // ============================================
  
  /** Получить информацию о чате */
  getChat(chatId: string): Promise<ApiResult<MessengerChat>>;
  
  /** Получить количество участников чата */
  getChatMemberCount(chatId: string): Promise<ApiResult<number>>;
  
  /** Получить список администраторов чата */
  getChatAdministrators(chatId: string): Promise<ApiResult<MessengerChatMember[]>>;
  
  /** Получить информацию о конкретном участнике чата */
  getChatMember(chatId: string, userId: string): Promise<ApiResult<MessengerChatMember>>;

  // ============================================
  // Работа с сообщениями
  // ============================================
  
  /** Отправить сообщение */
  sendMessage(
    chatId: string, 
    text: string, 
    options?: SendMessageOptions
  ): Promise<ApiResult<MessengerMessage>>;
  
  /** Редактировать сообщение */
  editMessage(
    chatId: string, 
    messageId: string, 
    text: string,
    options?: SendMessageOptions
  ): Promise<ApiResult<MessengerMessage>>;
  
  /** Удалить сообщение */
  deleteMessage(chatId: string, messageId: string): Promise<ApiResult<boolean>>;
  
  /** Ответить на callback query (для inline-кнопок) */
  answerCallbackQuery(
    callbackQueryId: string, 
    options?: { text?: string; showAlert?: boolean }
  ): Promise<ApiResult<boolean>>;

  // ============================================
  // Работа с медиа
  // ============================================
  
  /** Получить фотографии профиля пользователя */
  getUserProfilePhotos(
    userId: string, 
    options?: { offset?: number; limit?: number }
  ): Promise<ApiResult<string[]>>;
  
  /** Скачать файл */
  downloadFile(fileId: string): Promise<ApiResult<ArrayBuffer>>;

  // ============================================
  // Webhook
  // ============================================
  
  /** Установить webhook */
  setWebhook(
    url: string, 
    options?: { 
      secretToken?: string; 
      allowedUpdates?: string[];
      dropPendingUpdates?: boolean;
    }
  ): Promise<ApiResult<boolean>>;
  
  /** Удалить webhook */
  deleteWebhook(): Promise<ApiResult<boolean>>;
  
  /** Получить информацию о webhook */
  getWebhookInfo(): Promise<ApiResult<WebhookInfo>>;

  // ============================================
  // Ссылки-приглашения
  // ============================================
  
  /** Создать ссылку-приглашение */
  createChatInviteLink(
    chatId: string,
    options?: {
      name?: string;
      expireDate?: Date;
      memberLimit?: number;
      createsJoinRequest?: boolean;
    }
  ): Promise<ApiResult<string>>;
}

/**
 * Базовый класс для адаптеров мессенджеров
 * Предоставляет общую логику для всех платформ
 */
export abstract class BaseMessengerAdapter implements MessengerAdapter {
  abstract readonly platform: MessengerPlatform;
  abstract readonly platformName: string;
  
  protected token: string;
  protected logger: ReturnType<typeof import('@/lib/logger').createServiceLogger>;
  
  constructor(token: string, loggerName: string) {
    this.token = token;
    // Динамический импорт для избежания циклических зависимостей
    const { createServiceLogger } = require('@/lib/logger');
    this.logger = createServiceLogger(loggerName);
  }
  
  // Абстрактные методы, которые должны реализовать наследники
  abstract getMe(): Promise<ApiResult<MessengerUser>>;
  abstract getChat(chatId: string): Promise<ApiResult<MessengerChat>>;
  abstract getChatMemberCount(chatId: string): Promise<ApiResult<number>>;
  abstract getChatAdministrators(chatId: string): Promise<ApiResult<MessengerChatMember[]>>;
  abstract getChatMember(chatId: string, userId: string): Promise<ApiResult<MessengerChatMember>>;
  abstract sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<ApiResult<MessengerMessage>>;
  abstract editMessage(chatId: string, messageId: string, text: string, options?: SendMessageOptions): Promise<ApiResult<MessengerMessage>>;
  abstract deleteMessage(chatId: string, messageId: string): Promise<ApiResult<boolean>>;
  abstract answerCallbackQuery(callbackQueryId: string, options?: { text?: string; showAlert?: boolean }): Promise<ApiResult<boolean>>;
  abstract getUserProfilePhotos(userId: string, options?: { offset?: number; limit?: number }): Promise<ApiResult<string[]>>;
  abstract downloadFile(fileId: string): Promise<ApiResult<ArrayBuffer>>;
  abstract setWebhook(url: string, options?: { secretToken?: string; allowedUpdates?: string[]; dropPendingUpdates?: boolean }): Promise<ApiResult<boolean>>;
  abstract deleteWebhook(): Promise<ApiResult<boolean>>;
  abstract getWebhookInfo(): Promise<ApiResult<WebhookInfo>>;
  abstract createChatInviteLink(chatId: string, options?: { name?: string; expireDate?: Date; memberLimit?: number; createsJoinRequest?: boolean }): Promise<ApiResult<string>>;
  
  /**
   * Хелпер для создания успешного результата
   */
  protected success<T>(data: T): ApiResult<T> {
    return { ok: true, data };
  }
  
  /**
   * Хелпер для создания результата с ошибкой
   */
  protected error<T>(message: string, code?: number): ApiResult<T> {
    return { ok: false, error: message, errorCode: code };
  }
}

