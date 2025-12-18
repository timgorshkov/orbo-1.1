/**
 * Hawk Error Monitoring
 * https://hawk.so - российская альтернатива Sentry
 * 
 * Автоматически отлавливает ошибки и отправляет на hawk.so
 */

import HawkCatcher from '@hawk.so/nodejs';
import { createServiceLogger } from './logger';

let isInitialized = false;

/**
 * Инициализация Hawk
 * Вызывается один раз при старте сервера
 */
export function initHawk() {
  const logger = createServiceLogger('Hawk');
  if (isInitialized) return;
  
  const token = process.env.HAWK_TOKEN;
  
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn({}, 'HAWK_TOKEN not set - error monitoring disabled');
    }
    return;
  }

  try {
    HawkCatcher.init({
      token,
      release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      context: {
        environment: process.env.NODE_ENV,
        app: 'orbo',
      },
      // Фильтрация sensitive данных
      beforeSend: (event) => {
        // Удаляем пароли из контекста (только если context - объект)
        if (event.context && typeof event.context === 'object' && !Array.isArray(event.context)) {
          const ctx = event.context as Record<string, unknown>;
          delete ctx.password;
          delete ctx.token;
          delete ctx.secret;
        }
        return event;
      },
    });
    
    isInitialized = true;
    logger.info({}, 'Error monitoring initialized');
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error)
    }, 'Failed to initialize');
  }
}

/**
 * Отправка ошибки в Hawk
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>,
  user?: { id: string | number; name?: string }
) {
  const logger = createServiceLogger('Hawk');
  if (!isInitialized) {
    logger.error({ 
      error: error.message,
      stack: error.stack
    }, 'Not initialized, error not sent');
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HawkCatcher.send(error, context as any, user as any);
  } catch (e) {
    logger.error({ 
      error: e instanceof Error ? e.message : String(e),
      original_error: error.message
    }, 'Failed to send error');
  }
}

/**
 * Отправка предупреждения
 */
export function captureWarning(
  message: string,
  context?: Record<string, unknown>
) {
  const logger = createServiceLogger('Hawk');
  if (!isInitialized) return;

  try {
    const warning = new Error(`[Warning] ${message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HawkCatcher.send(warning, { ...context, level: 'warning' } as any);
  } catch (e) {
    logger.error({ 
      error: e instanceof Error ? e.message : String(e),
      warning_message: message
    }, 'Failed to send warning');
  }
}

// Автоматическая инициализация при импорте (только на сервере)
if (typeof window === 'undefined') {
  initHawk();
}

export default HawkCatcher;

