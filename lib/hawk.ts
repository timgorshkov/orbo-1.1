/**
 * Hawk Error Monitoring
 * https://hawk.so - российская альтернатива Sentry
 * 
 * Автоматически отлавливает ошибки и отправляет на hawk.so
 * 
 * NOTE: НЕ импортируем logger.ts здесь, чтобы избежать циклического импорта!
 * logger.ts импортирует captureError из этого файла.
 */

import HawkCatcher from '@hawk.so/nodejs';
import { Buffer } from 'buffer';

// Используем globalThis для предотвращения повторной инициализации
// между разными процессами/воркерами Next.js
declare global {
  // eslint-disable-next-line no-var
  var __hawkInitialized: boolean | undefined;
  // eslint-disable-next-line no-var  
  var __hawkInitAttempted: boolean | undefined;
}

// Проверяем глобальное состояние
let isInitialized = globalThis.__hawkInitialized ?? false;

// Простой логгер без циклического импорта
const hawkLog = {
  info: (msg: string) => console.log(`[Hawk] ${msg}`),
  warn: (msg: string) => console.warn(`[Hawk] ${msg}`),
  error: (msg: string, err?: unknown) => console.error(`[Hawk] ${msg}`, err || ''),
};

/**
 * Валидация токена Hawk
 * Токен должен быть Base64-закодированным JSON с полем integrationId
 */
function validateHawkToken(token: string): { valid: boolean; error?: string; integrationId?: string } {
  try {
    // Убираем возможные пробелы и переносы строк
    const cleanToken = token.trim();
    
    // Проверяем что токен похож на Base64
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanToken)) {
      return { valid: false, error: 'Token contains invalid characters (not Base64)' };
    }
    
    // Декодируем Base64
    const decoded = Buffer.from(cleanToken, 'base64').toString('utf-8');
    
    // Парсим JSON
    const parsed = JSON.parse(decoded);
    
    // Проверяем наличие integrationId
    if (!parsed.integrationId || parsed.integrationId === '') {
      return { valid: false, error: 'Token JSON does not contain integrationId field' };
    }
    
    return { valid: true, integrationId: parsed.integrationId };
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { valid: false, error: 'Token is not valid Base64-encoded JSON' };
    }
    return { valid: false, error: e instanceof Error ? e.message : 'Unknown validation error' };
  }
}

/**
 * Инициализация Hawk
 * Вызывается один раз при старте сервера
 */
export function initHawk() {
  // Проверяем и локальное, и глобальное состояние
  if (isInitialized || globalThis.__hawkInitialized) {
    return;
  }
  
  // Предотвращаем повторные попытки инициализации при ошибках
  if (globalThis.__hawkInitAttempted) {
    return;
  }
  globalThis.__hawkInitAttempted = true;
  
  const token = process.env.HAWK_TOKEN;
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  
  if (!token) {
    // Don't warn during build phase - HAWK_TOKEN is not available at build time
    if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
      hawkLog.warn('HAWK_TOKEN not set - error monitoring disabled');
    }
    return;
  }

  // Предварительная валидация токена
  const validation = validateHawkToken(token);
  if (!validation.valid) {
    hawkLog.error(`Invalid HAWK_TOKEN: ${validation.error}. Token length: ${token.length}, prefix: ${token.substring(0, 10)}...`);
    return;
  }

  try {
    // Инициализация по документации - сначала простой вариант с токеном
    const cleanToken = token.trim();
    
    // Попробуем инициализировать с полными настройками
    HawkCatcher.init({
      token: cleanToken,
      release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      context: {
        environment: process.env.NODE_ENV,
        app: 'orbo',
      },
      disableGlobalErrorsHandling: false, // Явно включаем глобальные обработчики
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
    globalThis.__hawkInitialized = true;
    hawkLog.info(`Error monitoring initialized (integration: ${validation.integrationId})`);
  } catch (error) {
    // Логируем ошибку но не считаем это критичным - возможно другой воркер успешно инициализировался
    const errorMessage = error instanceof Error ? error.message : String(error);
    hawkLog.warn(`Initialization warning: ${errorMessage} (may succeed in another worker)`);
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
  if (!isInitialized && !globalThis.__hawkInitialized) {
    // Не логируем здесь, чтобы избежать спама - просто тихо игнорируем
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HawkCatcher.send(error, context as any, user as any);
  } catch (e) {
    hawkLog.error('Failed to send error', e);
  }
}

/**
 * Отправка предупреждения
 */
export function captureWarning(
  message: string,
  context?: Record<string, unknown>
) {
  if (!isInitialized && !globalThis.__hawkInitialized) return;

  try {
    const warning = new Error(`[Warning] ${message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HawkCatcher.send(warning, { ...context, level: 'warning' } as any);
  } catch (e) {
    hawkLog.error('Failed to send warning', e);
  }
}

/**
 * Отправка тестового события в Hawk
 * Используется для проверки что интеграция работает
 */
export function sendTestEvent(): boolean {
  if (!isInitialized && !globalThis.__hawkInitialized) {
    hawkLog.warn('Cannot send test event - Hawk not initialized');
    return false;
  }

  try {
    const testError = new Error('[Test] Hawk integration test event');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HawkCatcher.send(testError, { test: true, timestamp: new Date().toISOString() } as any);
    hawkLog.info('Test event sent to Hawk');
    return true;
  } catch (e) {
    hawkLog.error('Failed to send test event', e);
    return false;
  }
}

// Автоматическая инициализация при импорте (только на сервере)
if (typeof window === 'undefined') {
  initHawk();
}

export default HawkCatcher;

