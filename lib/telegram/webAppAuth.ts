/**
 * Telegram WebApp Authentication
 * 
 * Validates initData from Telegram Mini App
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import crypto from 'crypto';

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramWebAppInitData {
  query_id?: string;
  user?: TelegramWebAppUser;
  auth_date: number;
  hash: string;
  start_param?: string; // e.g., "e-{eventId}"
}

/**
 * Parse initData string into object
 */
export function parseInitData(initDataString: string): Record<string, string> {
  const params = new URLSearchParams(initDataString);
  const result: Record<string, string> = {};
  
  params.forEach((value, key) => {
    result[key] = value;
  });
  
  return result;
}

export type InitDataFailReason =
  | 'empty'
  | 'no_hash'
  | 'expired'
  | 'hash_mismatch'
  | 'bad_user_json'
  | 'exception';

export interface InitDataValidationResult {
  ok: boolean;
  data?: TelegramWebAppInitData;
  reason?: InitDataFailReason;
  /** Короткие поля для диагностики — не содержат секретов. */
  meta?: {
    received_hash_prefix?: string;
    calculated_hash_prefix?: string;
    auth_date_diff_sec?: number;
    param_keys?: string[];
  };
}

/**
 * Verbose version: возвращает причину отказа, пригодную для логирования
 * на уровне вызывающего роута. Сама функция тихая — не пишет в console,
 * чтобы не шуметь при штатном fallback между несколькими токенами ботов.
 */
export function validateInitDataWithReason(
  initDataString: string,
  botToken: string
): InitDataValidationResult {
  try {
    if (!initDataString) {
      return { ok: false, reason: 'empty' };
    }

    const params = parseInitData(initDataString);
    const paramKeys = Object.keys(params).sort();
    const hash = params.hash;

    if (!hash) {
      return { ok: false, reason: 'no_hash', meta: { param_keys: paramKeys } };
    }

    const authDate = parseInt(params.auth_date);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 часа
    const diff = now - authDate;

    if (diff > maxAge) {
      return {
        ok: false,
        reason: 'expired',
        meta: { auth_date_diff_sec: diff },
      };
    }

    const dataCheckString = Object.keys(params)
      .filter((key) => key !== 'hash')
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return {
        ok: false,
        reason: 'hash_mismatch',
        meta: {
          received_hash_prefix: hash.substring(0, 10),
          calculated_hash_prefix: calculatedHash.substring(0, 10),
          auth_date_diff_sec: diff,
        },
      };
    }

    let user: TelegramWebAppUser | undefined;
    if (params.user) {
      try {
        user = JSON.parse(params.user);
      } catch {
        return { ok: false, reason: 'bad_user_json' };
      }
    }

    return {
      ok: true,
      data: {
        query_id: params.query_id,
        user,
        auth_date: authDate,
        hash,
        start_param: params.start_param,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'exception',
      meta: { param_keys: [error instanceof Error ? error.message : String(error)] },
    };
  }
}

/**
 * Legacy API: `null | TelegramWebAppInitData`. Под капотом использует verbose-
 * валидатор, но не логирует сам — вызывающий код решает, писать ли в логи.
 */
export function validateInitData(
  initDataString: string,
  botToken: string
): TelegramWebAppInitData | null {
  const res = validateInitDataWithReason(initDataString, botToken);
  return res.ok && res.data ? res.data : null;
}

export type KnownBot = 'registration' | 'community' | 'event';

export interface InitDataMultiBotResult {
  ok: boolean;
  data?: TelegramWebAppInitData;
  /** Какой бот успешно подтвердил подпись (если ok=true). */
  bot?: KnownBot;
  /** Попытки в порядке проверки — для логирования при полном фейле. */
  attempts: Array<{
    bot: KnownBot;
    reason: InitDataFailReason;
    meta?: InitDataValidationResult['meta'];
  }>;
}

/**
 * Перебирает все настроенные токены ботов и пытается валидировать initData.
 *
 * У Orbo три бота: @orbo_assistant_bot (registration), @orbo_community_bot
 * (community), @orbo_event_bot (event). Mini-app может быть открыт из любого
 * из них, и initData будет подписан токеном именно того бота, через которого
 * пользователь зашёл — мы не можем узнать заранее, какой это токен.
 *
 * Не настроенные в env токены тихо пропускаются. Если ни один токен не
 * подтвердил подпись, `attempts` содержит причины отказа по каждому, что
 * удобно логировать вызывающему коду.
 */
export function validateInitDataAnyBot(initDataString: string): InitDataMultiBotResult {
  const tokens: Array<{ bot: KnownBot; token: string | undefined }> = [
    { bot: 'registration', token: process.env.TELEGRAM_REGISTRATION_BOT_TOKEN },
    { bot: 'community', token: process.env.TELEGRAM_BOT_TOKEN },
    { bot: 'event', token: process.env.TELEGRAM_EVENT_BOT_TOKEN },
  ];

  const attempts: InitDataMultiBotResult['attempts'] = [];

  for (const { bot, token } of tokens) {
    if (!token) continue;
    const result = validateInitDataWithReason(initDataString, token);
    if (result.ok && result.data) {
      return { ok: true, data: result.data, bot, attempts };
    }
    attempts.push({
      bot,
      reason: result.reason || 'exception',
      meta: result.meta,
    });
  }

  return { ok: false, attempts };
}

/**
 * Extract event ID from start_param
 * Format: "e-{eventId}" or just "{eventId}"
 */
export function extractEventId(startParam: string | undefined): string | null {
  if (!startParam) return null;
  
  // Format: "e-{eventId}"
  if (startParam.startsWith('e-')) {
    return startParam.substring(2);
  }
  
  // Just UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(startParam)) {
    return startParam;
  }
  
  return null;
}

/**
 * Get the Event Bot token from environment
 */
export function getEventBotToken(): string | null {
  return process.env.TELEGRAM_EVENT_BOT_TOKEN || null;
}

/**
 * Get the Event Bot username from environment
 */
export function getEventBotUsername(): string {
  return process.env.TELEGRAM_EVENT_BOT_USERNAME || 'orbo_event_bot';
}

/**
 * Generate MiniApp link for an event
 */
export function generateEventMiniAppLink(eventId: string): string {
  const botUsername = getEventBotUsername();
  return `https://t.me/${botUsername}?startapp=e-${eventId}`;
}

