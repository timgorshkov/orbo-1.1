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
const logger = createServiceLogger('OpenAI');

if (PROXY_URL) {
  // Устанавливаем глобальный прокси для всех fetch запросов
  const proxyAgent = new ProxyAgent(PROXY_URL);
  setGlobalDispatcher(proxyAgent);
  logger.info({}, 'Proxy configured');
} else {
  logger.warn({}, 'No OPENAI_PROXY_URL set - requests may be blocked from Russia');
}

// OpenAI клиент
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
