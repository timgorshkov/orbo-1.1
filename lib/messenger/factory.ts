/**
 * Фабрика для создания адаптеров мессенджеров
 * 
 * Централизованное создание адаптеров для разных платформ.
 * Упрощает добавление новых платформ в будущем.
 */

import type { MessengerPlatform } from './types';
import type { MessengerAdapter } from './adapter';
import { TelegramAdapter } from './adapters/telegram-adapter';

/**
 * Конфигурация для создания адаптера
 */
export interface AdapterConfig {
  /** Токен бота */
  token: string;
  /** Дополнительные опции */
  options?: Record<string, unknown>;
}

/**
 * Создать адаптер для указанной платформы
 * 
 * @param platform - Платформа мессенджера
 * @param config - Конфигурация адаптера
 * @returns Экземпляр адаптера
 * 
 * @example
 * ```ts
 * const telegramAdapter = createAdapter('telegram', { token: 'BOT_TOKEN' });
 * const maxAdapter = createAdapter('max', { token: 'MAX_TOKEN' });
 * ```
 */
export function createAdapter(
  platform: MessengerPlatform, 
  config: AdapterConfig
): MessengerAdapter {
  switch (platform) {
    case 'telegram':
      return new TelegramAdapter(config.token);
    
    case 'max':
      // TODO: Реализовать MaxAdapter после добавления пакета @maxhub/max-bot-api
      throw new Error('MAX adapter not implemented yet. Install @maxhub/max-bot-api first.');
    
    case 'whatsapp':
      // TODO: Реализовать WhatsAppAdapter
      throw new Error('WhatsApp adapter not implemented yet.');
    
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Получить токен из переменных окружения для платформы
 */
export function getTokenFromEnv(platform: MessengerPlatform, botType: string = 'main'): string | undefined {
  switch (platform) {
    case 'telegram':
      switch (botType) {
        case 'main':
          return process.env.TELEGRAM_BOT_TOKEN;
        case 'notifications':
          return process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;
        case 'event':
          return process.env.TELEGRAM_EVENT_BOT_TOKEN;
        default:
          return process.env.TELEGRAM_BOT_TOKEN;
      }
    
    case 'max':
      switch (botType) {
        case 'main':
          return process.env.MAX_BOT_TOKEN;
        case 'notifications':
          return process.env.MAX_NOTIFICATIONS_BOT_TOKEN;
        default:
          return process.env.MAX_BOT_TOKEN;
      }
    
    case 'whatsapp':
      return process.env.WHATSAPP_API_TOKEN;
    
    default:
      return undefined;
  }
}

/**
 * Создать адаптер с токеном из переменных окружения
 */
export function createAdapterFromEnv(
  platform: MessengerPlatform, 
  botType: string = 'main'
): MessengerAdapter {
  const token = getTokenFromEnv(platform, botType);
  
  if (!token) {
    throw new Error(`Token not found in environment for platform: ${platform}, botType: ${botType}`);
  }
  
  return createAdapter(platform, { token });
}

/**
 * Проверить, поддерживается ли платформа
 */
export function isPlatformSupported(platform: string): platform is MessengerPlatform {
  return ['telegram', 'max', 'whatsapp'].includes(platform);
}

/**
 * Проверить, реализован ли адаптер для платформы
 */
export function isAdapterImplemented(platform: MessengerPlatform): boolean {
  switch (platform) {
    case 'telegram':
      return true;
    case 'max':
      return false; // Будет true после реализации MaxAdapter
    case 'whatsapp':
      return false;
    default:
      return false;
  }
}

/**
 * Получить список всех поддерживаемых платформ
 */
export function getSupportedPlatforms(): MessengerPlatform[] {
  return ['telegram', 'max', 'whatsapp'];
}

/**
 * Получить список реализованных платформ
 */
export function getImplementedPlatforms(): MessengerPlatform[] {
  return getSupportedPlatforms().filter(isAdapterImplemented);
}

