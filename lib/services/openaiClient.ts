/**
 * Centralized OpenAI client with proxy support
 * 
 * Использует прокси для обхода блокировок OpenAI API
 * Работает через undici ProxyAgent (встроен в Node.js 18+)
 */

import OpenAI from 'openai';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// Прокси ProxyCove (можно переопределить через env)
const PROXY_URL = process.env.OPENAI_PROXY_URL || 'http://bf2019a0359d1bb0c46d:a957970f219298b9@go.proxycove.com:10001';

// Устанавливаем глобальный прокси для всех fetch запросов
const proxyAgent = new ProxyAgent(PROXY_URL);
setGlobalDispatcher(proxyAgent);

// OpenAI клиент (теперь все fetch запросы идут через прокси)
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
