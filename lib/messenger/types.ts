/**
 * Абстрактные типы для мульти-платформенной архитектуры мессенджеров
 * Поддерживаемые платформы: Telegram, MAX, WhatsApp
 */

// ============================================
// Платформы
// ============================================

export type MessengerPlatform = 'telegram' | 'max' | 'whatsapp';

// ============================================
// Пользователи
// ============================================

export interface MessengerUser {
  /** ID пользователя на платформе (строка для универсальности) */
  platformUserId: string;
  /** Username (без @) */
  username?: string;
  /** Полное имя */
  fullName?: string;
  /** Имя */
  firstName?: string;
  /** Фамилия */
  lastName?: string;
  /** URL фото профиля */
  photoUrl?: string;
  /** Является ботом */
  isBot?: boolean;
  /** Дополнительные данные платформы */
  rawData?: Record<string, unknown>;
}

// ============================================
// Чаты/Группы
// ============================================

export type ChatType = 'private' | 'group' | 'supergroup' | 'channel';

export interface MessengerChat {
  /** ID чата на платформе */
  chatId: string;
  /** Тип чата */
  type: ChatType;
  /** Название (для групп/каналов) */
  title?: string;
  /** Описание */
  description?: string;
  /** Количество участников */
  memberCount?: number;
  /** URL фото чата */
  photoUrl?: string;
  /** Ссылка-приглашение */
  inviteLink?: string;
  /** Дополнительные данные платформы */
  rawData?: Record<string, unknown>;
}

// ============================================
// Участники чата
// ============================================

export type ChatMemberStatus = 
  | 'creator' 
  | 'administrator' 
  | 'member' 
  | 'restricted' 
  | 'left' 
  | 'kicked';

export interface MessengerChatMember {
  user: MessengerUser;
  status: ChatMemberStatus;
  /** Кастомный титул (для админов) */
  customTitle?: string;
  /** Может удалять сообщения */
  canDeleteMessages?: boolean;
  /** Может управлять участниками */
  canManageMembers?: boolean;
  /** Дополнительные данные платформы */
  rawData?: Record<string, unknown>;
}

// ============================================
// Сообщения
// ============================================

export interface MessengerMessage {
  /** ID сообщения на платформе */
  messageId: string;
  /** ID чата */
  chatId: string;
  /** ID отправителя */
  senderId: string;
  /** Текст сообщения */
  text?: string;
  /** ID сообщения, на которое это ответ */
  replyToMessageId?: string;
  /** Время отправки */
  timestamp: Date;
  /** Вложения */
  attachments?: MessengerAttachment[];
  /** Дополнительные данные платформы */
  rawData?: Record<string, unknown>;
}

export interface MessengerAttachment {
  type: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'other';
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  url?: string;
}

// ============================================
// Опции отправки сообщений
// ============================================

export interface SendMessageOptions {
  /** Формат текста */
  parseMode?: 'html' | 'markdown';
  /** ID сообщения для ответа */
  replyToMessageId?: string;
  /** Inline-клавиатура */
  inlineKeyboard?: InlineKeyboardButton[][];
  /** Отключить превью ссылок */
  disableLinkPreview?: boolean;
  /** Отключить уведомление */
  disableNotification?: boolean;
}

export interface InlineKeyboardButton {
  /** Текст кнопки */
  text: string;
  /** Callback data (для callback кнопок) */
  callbackData?: string;
  /** URL (для ссылок) */
  url?: string;
  /** URL мини-приложения */
  webAppUrl?: string;
}

// ============================================
// Обновления (события)
// ============================================

export type UpdateType = 
  | 'message'
  | 'edited_message'
  | 'callback_query'
  | 'chat_member_joined'
  | 'chat_member_left'
  | 'chat_member_updated'
  | 'bot_added'
  | 'bot_removed'
  | 'unknown';

export interface MessengerUpdate {
  /** ID обновления */
  updateId: string;
  /** Тип обновления */
  type: UpdateType;
  /** Платформа */
  platform: MessengerPlatform;
  /** Данные сообщения (если type = message) */
  message?: MessengerMessage;
  /** Callback query (если type = callback_query) */
  callbackQuery?: MessengerCallbackQuery;
  /** Данные об изменении участника */
  chatMemberUpdate?: MessengerChatMemberUpdate;
  /** Сырые данные от платформы */
  rawData: Record<string, unknown>;
}

export interface MessengerCallbackQuery {
  id: string;
  from: MessengerUser;
  message?: MessengerMessage;
  data?: string;
  chatInstance?: string;
}

export interface MessengerChatMemberUpdate {
  chat: MessengerChat;
  from: MessengerUser;
  date: Date;
  oldMember?: MessengerChatMember;
  newMember: MessengerChatMember;
}

// ============================================
// Результаты API-вызовов
// ============================================

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: number;
}

// ============================================
// Webhook
// ============================================

export interface WebhookInfo {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate?: Date;
  lastErrorMessage?: string;
  maxConnections?: number;
  allowedUpdates?: string[];
}

