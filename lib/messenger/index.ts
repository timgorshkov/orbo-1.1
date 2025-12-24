/**
 * Messenger Abstraction Layer
 * 
 * Мульти-платформенная абстракция для работы с мессенджерами.
 * Поддерживаемые платформы: Telegram, MAX, WhatsApp.
 * 
 * @example
 * ```ts
 * import { createAdapter, createAdapterFromEnv } from '@/lib/messenger';
 * 
 * // Создание адаптера с токеном
 * const telegram = createAdapter('telegram', { token: 'BOT_TOKEN' });
 * 
 * // Создание адаптера из переменных окружения
 * const tg = createAdapterFromEnv('telegram', 'main');
 * 
 * // Использование
 * const botInfo = await tg.getMe();
 * if (botInfo.ok) {
 *   console.log(`Bot: ${botInfo.data.fullName}`);
 * }
 * 
 * // Отправка сообщения
 * await tg.sendMessage(chatId, 'Hello!', { parseMode: 'html' });
 * ```
 */

// Типы
export * from './types';

// Адаптер (интерфейс и базовый класс)
export { MessengerAdapter, BaseMessengerAdapter } from './adapter';

// Фабрика
export {
  createAdapter,
  createAdapterFromEnv,
  getTokenFromEnv,
  isPlatformSupported,
  isAdapterImplemented,
  getSupportedPlatforms,
  getImplementedPlatforms,
  type AdapterConfig,
} from './factory';

// Конкретные адаптеры
export { TelegramAdapter, createTelegramAdapter } from './adapters/telegram-adapter';

// Будущие адаптеры (добавлять по мере реализации)
// export { MaxAdapter, createMaxAdapter } from './adapters/max-adapter';
// export { WhatsAppAdapter, createWhatsAppAdapter } from './adapters/whatsapp-adapter';

