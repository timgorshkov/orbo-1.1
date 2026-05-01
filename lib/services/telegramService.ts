/**
 * Сервис для взаимодействия с Telegram Bot API
 *
 * Multi-channel outbound. Try in order until one succeeds:
 *   1. Worker  — Cloudflare Worker reverse proxy (TELEGRAM_API_BASE_PRIMARY).
 *                Cheapest and fastest if available; one canonical HTTPS URL.
 *   2. Proxy   — undici ProxyAgent through a third-party HTTP(S) proxy
 *                (TELEGRAM_PROXY_URL, fallback OPENAI_PROXY_URL).
 *   3. Direct  — last resort to api.telegram.org. Usually blocked from RU
 *                servers but kept as the final attempt.
 *
 * A failed channel goes into a 30s cooldown so we don't keep slamming it.
 *
 * Environment:
 *   TELEGRAM_API_BASE_PRIMARY  — full origin of the Worker (e.g. https://orbo-tg-proxy.example.workers.dev).
 *                                When set, this channel is tried first.
 *   TELEGRAM_PROXY_URL         — http(s)://user:pass@host:port (proxys.io, etc).
 *   OPENAI_PROXY_URL           — same format, used as fallback if TELEGRAM_PROXY_URL is unset.
 *   TELEGRAM_PROXY_ENABLED     — "false" to disable the proxy channel entirely.
 *   TELEGRAM_DIRECT_DISABLED   — "true" to skip the direct channel (recommended for RU-only servers).
 */
import { createServiceLogger } from '@/lib/logger';
import { ProxyAgent } from 'undici';

const logger = createServiceLogger('TelegramService');

const TG_API_HOST = 'api.telegram.org';
const TG_API_DIRECT_BASE = `https://${TG_API_HOST}`;

// ─── Channel: Worker ────────────────────────────────────────
// Trim trailing slash so we can safely concat with paths
const WORKER_BASE = (process.env.TELEGRAM_API_BASE_PRIMARY || '').replace(/\/+$/, '');

// ─── Channel: Proxy ─────────────────────────────────────────
const TG_PROXY_URL = process.env.TELEGRAM_PROXY_URL || process.env.OPENAI_PROXY_URL;
const PROXY_ENABLED = process.env.TELEGRAM_PROXY_ENABLED !== 'false';

// ─── Channel: Direct ────────────────────────────────────────
const DIRECT_DISABLED = process.env.TELEGRAM_DIRECT_DISABLED === 'true';

// Build a fresh ProxyAgent. Re-created when we suspect the pool has stale
// half-closed sockets accumulating "fetch failed" errors.
function createProxyAgent(): ProxyAgent | undefined {
  if (!TG_PROXY_URL || !PROXY_ENABLED) return undefined;
  try {
    return new ProxyAgent({
      uri: TG_PROXY_URL,
      keepAliveTimeout: 4_000,
      keepAliveMaxTimeout: 30_000,
      connectTimeout: 10_000,
      pipelining: 0,
    });
  } catch (e) {
    logger.error({ error: e instanceof Error ? e.message : String(e) }, 'Failed to configure Telegram proxy');
    return undefined;
  }
}

let tgProxyAgent: ProxyAgent | undefined = createProxyAgent();

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  logger.info({
    worker_configured: !!WORKER_BASE,
    proxy_configured: !!tgProxyAgent,
    proxy_host: tgProxyAgent ? TG_PROXY_URL!.replace(/^https?:\/\/[^@]*@/, '').split(':')[0] : null,
    direct_disabled: DIRECT_DISABLED,
  }, 'Telegram outbound channels configured');
}

// Periodically refresh the proxy pool (every 5 min) — helps long-running
// containers shed broken keep-alive connections.
const POOL_REFRESH_MS = 5 * 60 * 1000;
let lastPoolRefresh = Date.now();
function maybeRefreshPool() {
  if (Date.now() - lastPoolRefresh > POOL_REFRESH_MS && tgProxyAgent) {
    const old = tgProxyAgent;
    tgProxyAgent = createProxyAgent();
    lastPoolRefresh = Date.now();
    old.close().catch(() => { /* ignore */ });
  }
}

// ─── Channel cooldown — skip a known-broken channel for 30s ─
type ChannelName = 'worker' | 'proxy' | 'direct';
const channelCooldownUntil: Record<ChannelName, number> = { worker: 0, proxy: 0, direct: 0 };
function isChannelCool(c: ChannelName): boolean {
  return Date.now() >= channelCooldownUntil[c];
}
function markChannelDown(c: ChannelName) {
  channelCooldownUntil[c] = Date.now() + 30_000;
}

// ─── Aggregate failure log (avoid spam) ─────────────────────
// We log at INFO not WARN: every proxy failure that gets here was followed
// by a successful Worker call (otherwise the route would've thrown
// "All channels failed" — that DOES stay at WARN/ERROR). A flapping paid
// proxy that the worker masks is a degraded-but-OK condition; it should
// inform, not alarm. Aggregation window is 5 min so a multi-minute flap
// produces one line, not five.
const PROXY_FAIL_LOG_INTERVAL_MS = 5 * 60 * 1000
let proxyFailsSinceLastLog = 0;
let lastProxyFailLog = 0;
function recordProxyFail(err: unknown) {
  proxyFailsSinceLastLog++;
  const now = Date.now();
  if (now - lastProxyFailLog > PROXY_FAIL_LOG_INTERVAL_MS) {
    logger.info({
      fails_since_last_log: proxyFailsSinceLastLog,
      last_error: err instanceof Error ? err.message : String(err),
    }, 'Telegram proxy transient errors (worker handled)');
    proxyFailsSinceLastLog = 0;
    lastProxyFailLog = now;
  }
}

// ─── Channel implementations ────────────────────────────────

/**
 * Rewrite the host of a Telegram API URL to a different origin.
 * `https://api.telegram.org/bot<token>/getMe` → `<base>/bot<token>/getMe`.
 * Non-Telegram URLs (e.g. file CDN) are passed through unchanged.
 */
function rewriteHost(url: string, base: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== TG_API_HOST) return url;
    return `${base}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

async function fetchViaWorker(url: string, init?: RequestInit): Promise<Response> {
  if (!WORKER_BASE) throw new Error('Worker not configured');
  const target = rewriteHost(url, WORKER_BASE);
  const workerInit: RequestInit = { ...init, signal: AbortSignal.timeout(15_000) };
  return fetch(target, workerInit);
}

async function fetchViaProxy(url: string, init?: RequestInit): Promise<Response> {
  if (!tgProxyAgent) throw new Error('Proxy not configured');
  const options: any = { ...init, dispatcher: tgProxyAgent };
  return fetch(url, options);
}

async function fetchDirect(url: string, init?: RequestInit): Promise<Response> {
  const directInit: RequestInit = { ...init, signal: AbortSignal.timeout(10_000) };
  return fetch(url, directInit);
}

/**
 * Build a status string describing why each channel was skipped or how it
 * failed. Used for the thrown error so the log says exactly which channels
 * were in cooldown vs. not configured vs. errored — instead of the misleading
 * "none configured" message we used to throw when everything was cooled down.
 */
function describeChannelState(
  failures: Record<ChannelName, string | null>
): string {
  const parts: string[] = []
  const now = Date.now()
  for (const ch of ['worker', 'proxy', 'direct'] as const) {
    if (failures[ch]) { parts.push(`${ch}: ${failures[ch]}`); continue; }
    if (ch === 'worker' && !WORKER_BASE) { parts.push(`${ch}: not configured`); continue; }
    if (ch === 'proxy' && !tgProxyAgent) { parts.push(`${ch}: not configured`); continue; }
    if (ch === 'direct' && DIRECT_DISABLED) { parts.push(`${ch}: disabled`); continue; }
    const remaining = channelCooldownUntil[ch] - now
    if (remaining > 0) parts.push(`${ch}: cooldown ${Math.ceil(remaining / 1000)}s`)
  }
  return parts.join(' | ') || 'no channels available'
}

/**
 * Единая точка вызова Telegram API. Используйте ВМЕСТО голого fetch().
 * Перебирает каналы worker → proxy → direct, пока один не ответит.
 *
 * If every channel is cooled down (no fresh attempt possible), waits until
 * the shortest cooldown clears (capped at 2s) and retries once. Without this
 * a burst caller (e.g. cron iterating 50 groups) would slam the cooldown and
 * receive "all channels failed" for every call until the next 30s window.
 */
export async function telegramFetch(url: string, init?: RequestInit): Promise<Response> {
  maybeRefreshPool();

  const failures: Record<ChannelName, string | null> = { worker: null, proxy: null, direct: null }
  let anyAttempted = false

  // 1. Worker
  if (WORKER_BASE && isChannelCool('worker')) {
    anyAttempted = true
    try {
      return await fetchViaWorker(url, init);
    } catch (err) {
      failures.worker = err instanceof Error ? err.message : String(err)
      markChannelDown('worker');
    }
  }

  // 2. Paid HTTP(S) proxy
  if (tgProxyAgent && isChannelCool('proxy')) {
    anyAttempted = true
    try {
      return await fetchViaProxy(url, init);
    } catch (err1) {
      // Single retry with a freshly created pool — covers stale-socket case
      try {
        if (tgProxyAgent) {
          const old = tgProxyAgent;
          tgProxyAgent = createProxyAgent();
          old.close().catch(() => { /* ignore */ });
        }
        return await fetchViaProxy(url, init);
      } catch (err2) {
        recordProxyFail(err2);
        failures.proxy = err2 instanceof Error ? err2.message : String(err2)
        markChannelDown('proxy');
      }
    }
  }

  // 3. Direct (last resort, usually blocked from RU servers)
  if (!DIRECT_DISABLED && isChannelCool('direct')) {
    anyAttempted = true
    try {
      return await fetchDirect(url, init);
    } catch (err) {
      failures.direct = err instanceof Error ? err.message : String(err)
      markChannelDown('direct');
    }
  }

  // If we didn't try anything (everything in cooldown), wait for the soonest
  // cooldown to clear (≤2s) and retry once. This breaks the bursty-caller
  // failure cascade where a sync loop hammers the function every few ms
  // during a transient network blip.
  if (!anyAttempted) {
    const now = Date.now()
    const candidates: number[] = []
    if (WORKER_BASE) candidates.push(channelCooldownUntil.worker - now)
    if (tgProxyAgent) candidates.push(channelCooldownUntil.proxy - now)
    if (!DIRECT_DISABLED) candidates.push(channelCooldownUntil.direct - now)
    const positive = candidates.filter((x) => x > 0)
    if (positive.length > 0) {
      const wait = Math.min(Math.min(...positive) + 50, 2000)
      await new Promise((r) => setTimeout(r, wait))
      // After wait try once more — re-enter the function (avoids deep recursion).
      return telegramFetch(url, init)
    }
  }

  throw new Error(`All Telegram outbound channels failed: ${describeChannelState(failures)}`);
}

export type TelegramBotType = 'main' | 'notifications' | 'event' | 'registration';

export class TelegramService {
  private apiBase = 'https://api.telegram.org/bot';
  private token: string;
  private botType: TelegramBotType;

  constructor(botType: TelegramBotType = 'main') {
    this.botType = botType;
    
    let token: string | undefined;
    switch (botType) {
      case 'main':
        token = process.env.TELEGRAM_BOT_TOKEN;
        break;
      case 'notifications':
        token = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;
        break;
      case 'event':
        token = process.env.TELEGRAM_EVENT_BOT_TOKEN;
        break;
      case 'registration':
        token = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN;
        break;
    }
      
    if (!token) {
      throw new Error(`Token not provided for bot type: ${botType}`);
    }
    
    this.token = token;
    logger.debug({ bot_type: botType, token_prefix: token.substring(0, 5) }, 'TelegramService initialized');
  }

  /**
   * Отправляет сообщение в чат Telegram
   */
  async sendMessage(chatId: number, text: string, options: any = {}) {
    const params: any = {
      chat_id: chatId,
      text,
      ...options
    };
    // Set default parse_mode only if not explicitly provided in options
    if (!('parse_mode' in options)) {
      params.parse_mode = 'HTML';
    }
    // Allow removing parse_mode by passing undefined or null
    if (params.parse_mode === undefined || params.parse_mode === null) {
      delete params.parse_mode;
    }
    return this.callApi('sendMessage', params);
  }

  /**
   * Отправляет фото в чат Telegram с подписью
   */
  async sendPhoto(chatId: number, photoUrl: string, options: { caption?: string; parse_mode?: string } = {}) {
    const params: any = {
      chat_id: chatId,
      photo: photoUrl,
      ...options
    };
    // Allow removing parse_mode by passing undefined or null
    if (params.parse_mode === undefined || params.parse_mode === null) {
      delete params.parse_mode;
    }
    return this.callApi('sendPhoto', params);
  }

  /**
   * Получает список форум-топиков для группы (Bot API: getForumTopics)
   * Работает только если бот является участником/администратором форум-группы.
   */
  async getForumTopics(chatId: number): Promise<Array<{ id: number; name: string }>> {
    try {
      const result = await this.callApi('getForumTopics', { chat_id: chatId });
      if (result?.ok && Array.isArray(result?.result?.topics)) {
        return result.result.topics.map((t: any) => ({
          id: t.message_thread_id,
          name: t.name,
        }));
      }
    } catch {
      // ignore — might not support forum topics
    }
    return [];
  }

  /**
   * Установка webhook для бота
   */
  async setWebhook(url: string, secretToken: string) {
    return this.callApi('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'message_reaction', 'message_reaction_count', 'my_chat_member', 'chat_member', 'chat_join_request']
    });
  }

  /**
   * Установка webhook с расширенными параметрами
   */
  async setWebhookAdvanced(params: {
    url: string;
    secret_token?: string;
    allowed_updates?: string[];
    drop_pending_updates?: boolean;
    max_connections?: number;
  }) {
    return this.callApi('setWebhook', params);
  }

  /**
   * Получение информации о webhook
   */
  async getWebhookInfo() {
    return this.callApi('getWebhookInfo', {});
  }

  /**
   * Получение информации о боте
   */
  async getMe() {
    return this.callApi('getMe');
  }

  /**
   * Получение информации о чате
   */
  async getChat(chatId: number) {
    return this.callApi('getChat', { chat_id: chatId });
  }

  /**
   * Получение информации об участниках группы
   */
  async getChatMembersCount(chatId: number) {
    return this.callApi('getChatMemberCount', { chat_id: chatId });
  }

  /**
   * Одобрить запрос на вступление в группу
   */
  async approveChatJoinRequest(chatId: number, userId: number) {
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      method: 'approveChatJoinRequest'
    }, '📞 [TG-SERVICE] Calling Telegram API approveChatJoinRequest');
    
    const result = await this.callApi('approveChatJoinRequest', {
      chat_id: chatId,
      user_id: userId
    });
    
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      ok: result.ok,
      error_code: result.error_code,
      description: result.description
    }, result.ok ? '✅ [TG-SERVICE] approveChatJoinRequest succeeded' : '❌ [TG-SERVICE] approveChatJoinRequest failed');
    
    return result;
  }

  /**
   * Отклонить запрос на вступление в группу
   */
  async declineChatJoinRequest(chatId: number, userId: number) {
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      method: 'declineChatJoinRequest'
    }, '📞 [TG-SERVICE] Calling Telegram API declineChatJoinRequest');
    
    const result = await this.callApi('declineChatJoinRequest', {
      chat_id: chatId,
      user_id: userId
    });
    
    logger.info({
      bot_type: this.botType,
      chat_id: chatId,
      user_id: userId,
      ok: result.ok,
      error_code: result.error_code,
      description: result.description
    }, result.ok ? '✅ [TG-SERVICE] declineChatJoinRequest succeeded' : '❌ [TG-SERVICE] declineChatJoinRequest failed');
    
    return result;
  }

  /**
   * Забанить пользователя в чате
   */
  async banChatMember(chatId: number, userId: number, untilDate?: number) {
    return this.callApi('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate
    });
  }

  /**
   * Разбанить пользователя в чате
   */
  async unbanChatMember(chatId: number, userId: number, onlyIfBanned: boolean = true) {
    return this.callApi('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: onlyIfBanned
    });
  }

  /**
   * Ограничить права пользователя в чате
   */
  async restrictChatMember(chatId: number, userId: number, permissions: any, untilDate?: number) {
    return this.callApi('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      until_date: untilDate
    });
  }

  async getAllChats() {
    // Получаем все обновления
    const updates = await this.getUpdates()
    
    if (!updates?.result) {
      return []
    }
    
    // Извлекаем уникальные ID чатов
    const chatIds = new Set<number>()
    
    updates.result.forEach((update: any) => {
      if (update.message?.chat?.id) {
        chatIds.add(update.message.chat.id)
      }
    })
    
    return Array.from(chatIds)
  }

/**
 * Получение информации о члене чата
 */
async getChatMember(chatId: number, userId: number) {
  return this.callApi('getChatMember', { 
    chat_id: chatId,
    user_id: userId
  });
}

  /**
   * Получение списка всех администраторов группы
   */
  async getChatAdministrators(chatId: number) {
    // Private chats (positive IDs) have no administrators — Telegram returns 400
    if (chatId > 0) {
      logger.debug({ chat_id: chatId }, 'getChatAdministrators skipped: private chat (positive ID)');
      return { ok: false, error_code: 400, description: 'Bad Request: private chat has no administrators' };
    }
    return this.callApi('getChatAdministrators', {
      chat_id: chatId
    });
  }

  /**
   * Создание ссылки-приглашения для группы
   */
  async createChatInviteLink(chatId: number, options: any = {}) {
    return this.callApi('createChatInviteLink', {
      chat_id: chatId,
      ...options
    });
  }

  /**
   * Получение обновлений бота
   */
  async getUpdates(options: { offset?: number, limit?: number, timeout?: number, deleteWebhook?: boolean } = {}) {
    try {
      // Если установлен флаг deleteWebhook, сначала удаляем вебхук
      if (options.deleteWebhook) {
        logger.debug({}, 'Deleting webhook before getting updates');
        const deleteResult = await this.callApi('deleteWebhook');
        if (!deleteResult.ok) {
          logger.error({ error: deleteResult.description || 'Unknown error' }, 'Failed to delete webhook');
          throw new Error(`Failed to delete webhook: ${deleteResult.description || 'Unknown error'}`);
        }
        logger.debug({}, 'Webhook deleted successfully');
      }
      
      // Добавляем параметры запроса
      const params = new URLSearchParams();
      if (options.offset !== undefined) params.append('offset', options.offset.toString());
      if (options.limit !== undefined) params.append('limit', options.limit.toString());
      if (options.timeout !== undefined) params.append('timeout', options.timeout.toString());
      
      // Вызываем API через общий метод callApi
      return await this.callApi('getUpdates', options.offset !== undefined || options.limit !== undefined || options.timeout !== undefined ? 
        { 
          offset: options.offset, 
          limit: options.limit, 
          timeout: options.timeout 
        } : {});
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Error getting Telegram updates');
      throw error; // Пробрасываем ошибку дальше для обработки
    }
  }

  /**
   * Отправка опроса в чат
   */
  async sendPoll(chatId: number, question: string, options: string[], pollOptions: any = {}) {
    return this.callApi('sendPoll', {
      chat_id: chatId,
      question,
      options,
      ...pollOptions
    });
  }

  /**
   * Отправка уведомления пользователю (для бота уведомлений)
   */
  async sendNotification(userId: number, text: string, options: any = {}) {
    if (this.botType !== 'notifications') {
      throw new Error('This method is only available for notification bots');
    }
    return this.sendMessage(userId, text, options);
  }

  /**
   * Отправка приветственного сообщения новому участнику группы
   */
  async sendWelcomeMessage(chatId: number, userId: number, welcomeText: string) {
    const mentionText = `<a href="tg://user?id=${userId}">Пользователь</a>`;
    const message = welcomeText.replace('{user}', mentionText);
    
    return this.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      disable_notification: false
    });
  }

  /**
   * Отправка файла или медиа в чат
   */
  async sendDocument(chatId: number, fileUrl: string, caption?: string) {
    return this.callApi('sendDocument', {
      chat_id: chatId,
      document: fileUrl,
      caption: caption || '',
      parse_mode: 'HTML'
    });
  }

  /**
   * Удаление сообщения из чата
   */
  async deleteMessage(chatId: number, messageId: number) {
    return this.callApi('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  /**
   * Получение фотографий профиля пользователя
   */
  async getUserProfilePhotos(userId: number, offset: number = 0, limit: number = 1) {
    return this.callApi('getUserProfilePhotos', {
      user_id: userId,
      offset,
      limit
    });
  }

  /**
   * Получение информации о файле для скачивания
   */
  async getFile(fileId: string) {
    return this.callApi('getFile', {
      file_id: fileId
    });
  }

  /**
   * Получение URL для скачивания файла
   */
  getFileUrl(filePath: string): string {
    return `https://api.telegram.org/file/bot${this.token}/${filePath}`;
  }

  /**
   * Скачивание и возврат буфера файла
   */
  async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const url = this.getFileUrl(filePath);
    const response = await telegramFetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    
    return await response.arrayBuffer();
  }

  /**
   * Общий метод для вызова Telegram API
   */
  private async callApi(method: string, params: any = {}) {
    const url = `${this.apiBase}${this.token}/${method}`;
    
    // Log critical methods like join request approval
    const criticalMethods = ['approveChatJoinRequest', 'declineChatJoinRequest'];
    if (criticalMethods.includes(method)) {
      logger.info({
        bot_type: this.botType,
        method,
        params,
        url_masked: `${this.apiBase}***/${method}`
      }, '🔧 [TG-API] Calling critical Telegram method');
    }
    
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'close',
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000), // 15s — proxy can be slow
      };
      // Use telegramFetch for proxy + fallback support
      const response = await telegramFetch(url, fetchOptions);

      const responseData = await response.json();
      
      if (criticalMethods.includes(method)) {
        logger.info({
          bot_type: this.botType,
          method,
          ok: responseData.ok,
          error_code: responseData.error_code,
          description: responseData.description,
          http_status: response.status
        }, '📥 [TG-API] Telegram API response received');
      }

      // Handle 429 Too Many Requests with automatic retry
      if (responseData.error_code === 429 && attempt < MAX_RETRIES - 1) {
        const retryAfter = (responseData.parameters?.retry_after || 5) + 1;
        logger.warn({
          bot_type: this.botType,
          method,
          retry_after: retryAfter,
          attempt: attempt + 1
        }, '⏳ [TG-API] Rate limited (429), waiting before retry');
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok || !responseData.ok) {
        // Check if this is an expected/normal error (don't log as ERROR).
        // 403 "can't initiate conversation" — пользователь не запускал бота,
        // нет DM-канала; обычное состояние, не сбой инфраструктуры.
        const isExpectedError =
          (responseData.error_code === 400 && responseData.description?.includes('user not found')) ||
          (responseData.error_code === 400 && responseData.description?.includes('chat not found')) ||
          (responseData.error_code === 400 && responseData.description?.includes('member not found')) ||
          (responseData.error_code === 400 && responseData.description?.includes('member list is inaccessible')) ||
          (responseData.error_code === 400 && responseData.description?.includes('PARTICIPANT_ID_INVALID')) ||
          (responseData.error_code === 400 && responseData.description?.includes('CHAT_ADMIN_REQUIRED')) ||
          (responseData.error_code === 400 && responseData.description?.includes('PEER_ID_INVALID')) ||
          (responseData.error_code === 403 && responseData.description?.includes("can't initiate conversation")) ||
          (responseData.error_code === 403 && responseData.description?.includes('bot was blocked')) ||
          (responseData.error_code === 403 && responseData.description?.includes('user is deactivated')) ||
          (responseData.error_code === 403 && responseData.description?.includes('bot was kicked')) ||
          (responseData.error_code === 403 && responseData.description?.includes('bot is not a member'));

        if (isExpectedError) {
          logger.debug({
            bot_type: this.botType,
            method,
            params,
            http_status: response.status,
            ok: responseData.ok,
            error_code: responseData.error_code,
            description: responseData.description
          }, '⚠️ [TG-API] Expected Telegram API error (user/chat unavailable)');
        } else {
          logger.error({
            bot_type: this.botType,
            method,
            params,
            http_status: response.status,
            ok: responseData.ok,
            error_code: responseData.error_code,
            description: responseData.description
          }, '❌ [TG-API] Telegram API returned error');
        }
        
        // Return error response instead of throwing
        return {
          ok: false,
          error_code: responseData.error_code,
          description: responseData.description || response.statusText
        };
      }

      return responseData;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isTransient = errorMessage.includes('fetch failed') ||
        errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('aborted due to timeout') || errorMessage.includes('TimeoutError');

      if (isTransient && attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }

      const isExpectedError = 
        errorMessage.includes('user not found') ||
        errorMessage.includes('chat not found') ||
        errorMessage.includes('USER_DELETED') ||
        errorMessage.includes('bot was blocked') ||
        errorMessage.includes('upgraded to a supergroup') ||
        errorMessage.includes('was kicked') ||
        errorMessage.includes('PEER_ID_INVALID');
      
      if (isExpectedError) {
        logger.debug({ method, error: errorMessage }, 'Expected Telegram API response');
      } else if (isTransient) {
        logger.warn({ method, error: errorMessage, attempts: attempt + 1 }, 'Telegram API network error after retries');
      } else {
        logger.error({ 
          method,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        }, 'Error calling Telegram API');
      }
      
      return {
        ok: false,
        error_code: 500,
        description: errorMessage
      };
    }
    } // end retry loop

    return { ok: false, error_code: 500, description: 'Max retries exceeded' };
  }
}

/**
 * Создает экземпляр сервиса Telegram с настройками по умолчанию
 */
export function createTelegramService(botType: 'main' | 'notifications' = 'main') {
  return new TelegramService(botType);
}

/**
 * Send a Telegram DM via the FIRST bot that has the right to message the user.
 *
 * Why: a participant might have only ever interacted with one of our bots
 * (e.g. opened the event MiniApp via @orbo_event_bot but never /started
 * @orbo_community_bot). A direct send through @orbo_community_bot would then
 * fail with `Forbidden: bot can't initiate conversation with a user` even
 * though we COULD have reached them through @orbo_event_bot.
 *
 * Two presets reflect who we're talking to:
 *
 *   - 'participant' (default): event → main → notifications. The event bot is
 *     the one community members interact with most often (event registrations,
 *     reminders, follow-ups), main (@orbo_community_bot) is the secondary
 *     touch-point, and notifications is a last-resort.
 *
 *   - 'admin': notifications → main → event. The notifications bot is the
 *     dedicated channel for system alerts to org admins (group activity,
 *     digests). It's intentionally first because admins explicitly /start
 *     it, so reachability is highest.
 *
 * `registration` bot is excluded from both presets — it's only used for
 * pipelined join-request flows, not for one-off DMs.
 *
 * On 5xx (transient gateway/network) the loop aborts so we don't burn through
 * the whole bot list on a temporary failure. On any 4xx we fall through.
 *
 * Returns: ok=true with bot_type/message_id on first success, or ok=false with
 * the last error after exhausting all bots.
 */
export type FallbackAudience = 'participant' | 'admin'

const PARTICIPANT_BOT_ORDER: TelegramBotType[] = ['event', 'main', 'notifications']
const ADMIN_BOT_ORDER: TelegramBotType[] = ['notifications', 'main', 'event']

/**
 * True when a Telegram error means "this user is not reachable via this bot"
 * — i.e. they never started the bot, blocked it, or the account is gone.
 * Such errors are expected and shouldn't surface as warnings; they tell the
 * caller "no DM channel available" rather than "something went wrong".
 */
export function isNoDmChannelError(err: { error_code?: number; description?: string }): boolean {
  if (err.error_code !== 403 && err.error_code !== 400) return false
  const d = (err.description || '').toLowerCase()
  return (
    d.includes("can't initiate conversation") ||
    d.includes('blocked by the user') ||
    d.includes('chat not found') ||
    d.includes('user is deactivated')
  )
}

export async function sendMessageWithFallback(
  chatId: number,
  text: string,
  options: any = {},
  opts: { audience?: FallbackAudience } = {}
): Promise<{
  ok: boolean
  bot_type?: TelegramBotType
  message_id?: number
  error_code?: number
  description?: string
  noDmChannel?: boolean
  attempts?: Array<{ bot_type: TelegramBotType; ok: boolean; error_code?: number; description?: string }>
}> {
  const order = opts.audience === 'admin' ? ADMIN_BOT_ORDER : PARTICIPANT_BOT_ORDER
  const attempts: Array<{ bot_type: TelegramBotType; ok: boolean; error_code?: number; description?: string }> = []
  let lastError: { error_code?: number; description?: string } = {}

  for (const botType of order) {
    // Skip if this bot's token isn't configured for our deployment
    const tokenEnvVar = (
      botType === 'main' ? 'TELEGRAM_BOT_TOKEN' :
      botType === 'notifications' ? 'TELEGRAM_NOTIFICATIONS_BOT_TOKEN' :
      botType === 'event' ? 'TELEGRAM_EVENT_BOT_TOKEN' :
      'TELEGRAM_REGISTRATION_BOT_TOKEN'
    )
    if (!process.env[tokenEnvVar]) continue

    try {
      const svc = new TelegramService(botType)
      const res = await svc.sendMessage(chatId, text, options)
      attempts.push({ bot_type: botType, ok: !!res.ok, error_code: res.error_code, description: res.description })
      if (res.ok) {
        return {
          ok: true,
          bot_type: botType,
          message_id: (res as any)?.result?.message_id,
          attempts,
        }
      }
      lastError = { error_code: res.error_code, description: res.description }
      // For 403 (no chat / blocked) try the next bot. For other errors that
      // indicate a permanent problem with this user (e.g. 400 chat not found),
      // also try next — they might still have a chat with another bot.
      // Don't try further on 5xx — those are transient and not user-specific.
      if (res.error_code && res.error_code >= 500) break
    } catch (err: any) {
      attempts.push({ bot_type: botType, ok: false, description: err?.message || 'send threw' })
      lastError = { description: err?.message }
    }
  }

  // If every attempted bot returned a "no DM channel" error, flag it so callers
  // can distinguish "user unreachable" (expected, silent) from "transport
  // failure" (warn-worthy). All-empty attempts (no bot configured) are not
  // counted as noDmChannel.
  const noDmChannel =
    attempts.length > 0 &&
    attempts.every((a) => !a.ok && isNoDmChannelError({ error_code: a.error_code, description: a.description }))

  return {
    ok: false,
    error_code: lastError.error_code,
    description: lastError.description,
    noDmChannel,
    attempts,
  }
}

/**
 * Интерфейсы для типизации Telegram-обновлений
 */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  chat_member?: TelegramChatMemberUpdate;
  my_chat_member?: TelegramChatMemberUpdate;
  chat_join_request?: TelegramChatJoinRequest;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  reply_to_message?: TelegramMessage;
  text?: string;
  entities?: TelegramMessageEntity[];
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  new_chat_title?: string;
  message_thread_id?: number;
  reply_to_message_id?: number;
  // Добавьте эти поля для медиа-контента
  photo?: any[];
  video?: any;
  document?: any;
  audio?: any;
  voice?: any;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
}

export interface TelegramChatMemberUpdate {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
}

export interface TelegramChatMember {
  user: TelegramUser;
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
}

export interface TelegramChatJoinRequest {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  bio?: string;
  invite_link?: TelegramChatInviteLink;
}

export interface TelegramChatInviteLink {
  invite_link: string;
  creator: TelegramUser;
  creates_join_request: boolean;
  is_primary: boolean;
  is_revoked: boolean;
  name?: string;
  expire_date?: number;
  member_limit?: number;
  pending_join_request_count?: number;
}
