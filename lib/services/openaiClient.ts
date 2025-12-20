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
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { createServiceLogger } from '@/lib/logger';

// Прокси URL из переменной окружения (обязательно!)
const PROXY_URL = process.env.OPENAI_PROXY_URL;
const API_KEY = process.env.OPENAI_API_KEY;
const logger = createServiceLogger('OpenAI');

// Skip logging during Next.js build phase to reduce noise
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuildPhase) {
  // Log configuration status at startup (only in runtime)
  logger.info({
    has_api_key: !!API_KEY,
    api_key_prefix: API_KEY ? API_KEY.substring(0, 7) + '...' : 'NOT_SET',
    has_proxy: !!PROXY_URL,
    proxy_host: PROXY_URL ? PROXY_URL.replace(/^https?:\/\/[^@]*@/, '').split(':')[0] : 'NOT_SET'
  }, '🔧 [OPENAI_CONFIG] OpenAI client initialization');
}

if (PROXY_URL) {
  try {
    // Устанавливаем глобальный прокси для всех fetch запросов
    const proxyAgent = new ProxyAgent(PROXY_URL);
    setGlobalDispatcher(proxyAgent);
    if (!isBuildPhase) {
      logger.info({ proxy_configured: true }, '✅ [OPENAI_CONFIG] Proxy configured successfully');
    }
  } catch (proxyError) {
    logger.error({ 
      error: proxyError instanceof Error ? proxyError.message : String(proxyError)
    }, '❌ [OPENAI_CONFIG] Failed to configure proxy');
  }
} else if (!isBuildPhase) {
  logger.warn({}, '⚠️ [OPENAI_CONFIG] No OPENAI_PROXY_URL set - requests may be blocked from Russia');
}

if (!API_KEY && !isBuildPhase) {
  logger.error({}, '❌ [OPENAI_CONFIG] OPENAI_API_KEY is not set - AI features will not work');
}

// OpenAI клиент
export const openai = new OpenAI({
  apiKey: API_KEY,
});

export default openai;
