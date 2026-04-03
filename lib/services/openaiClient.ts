/**
 * Centralized OpenAI client with proxy support
 * 
 * Использует прокси для обхода блокировок OpenAI API
 * Работает через undici ProxyAgent (встроен в Node.js 18+)
 * 
 * Required env variables:
 * - OPENAI_API_KEY: API ключ OpenAI
 * - OPENAI_PROXY_URL: URL прокси в формате http://user:pass@host:port
 */

import OpenAI from 'openai';
import { ProxyAgent } from 'undici';
import { createServiceLogger } from '@/lib/logger';

// Прокси URL из переменной окружения (опционально)
const PROXY_URL = process.env.OPENAI_PROXY_URL;
const API_KEY = process.env.OPENAI_API_KEY;
const logger = createServiceLogger('OpenAI');

// Skip logging during Next.js build phase to reduce noise
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuildPhase) {
  logger.info({
    has_api_key: !!API_KEY,
    api_key_prefix: API_KEY ? API_KEY.substring(0, 7) + '...' : 'NOT_SET',
    has_proxy: !!PROXY_URL,
    proxy_host: PROXY_URL ? PROXY_URL.replace(/^https?:\/\/[^@]*@/, '').split(':')[0] : 'NOT_SET'
  }, '🔧 [OPENAI_CONFIG] OpenAI client initialization');
}

if (!API_KEY && !isBuildPhase) {
  logger.error({}, '❌ [OPENAI_CONFIG] OPENAI_API_KEY is not set - AI features will not work');
}

// Прокси только для запросов к OpenAI — НЕ глобальный.
// setGlobalDispatcher НЕ используется: он перехватывал бы все fetch-запросы
// в процессе (Unisender, Telegram, Yandex OAuth и т.д.) и при недоступности
// прокси роняло бы всю авторизацию и email-рассылку.
let proxyFetch: typeof globalThis.fetch | undefined;
if (PROXY_URL) {
  try {
    const proxyAgent = new ProxyAgent(PROXY_URL);
    proxyFetch = (url, init) => fetch(url, { ...init, dispatcher: proxyAgent } as RequestInit);
    if (!isBuildPhase) {
      logger.info({ proxy_configured: true }, '✅ [OPENAI_CONFIG] Proxy configured for OpenAI only');
    }
  } catch (proxyError) {
    logger.error({
      error: proxyError instanceof Error ? proxyError.message : String(proxyError)
    }, '❌ [OPENAI_CONFIG] Failed to configure proxy');
  }
}

// OpenAI клиент с прокси только для своих запросов
export const openai = new OpenAI({
  apiKey: API_KEY,
  ...(proxyFetch && { fetch: proxyFetch }),
});

export default openai;
