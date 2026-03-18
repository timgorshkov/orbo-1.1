/**
 * MAX WebApp Authentication
 *
 * Validates initData from MAX Mini App.
 * The scheme is identical to Telegram: HMAC_SHA256("WebAppData", botToken) as secret,
 * then HMAC_SHA256(secretKey, dataCheckString) compared to hash.
 * https://dev.max.ru/docs/webapps/validation
 */

import crypto from 'crypto';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('MaxWebAppAuth');

export interface MaxWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string | null;
}

export interface MaxWebAppInitData {
  query_id?: string;
  user?: MaxWebAppUser;
  chat?: { id: number; type: string };
  auth_date: number;
  hash: string;
  start_param?: string;
}

export function parseInitData(initDataString: string): Record<string, string> {
  const params = new URLSearchParams(initDataString);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Validate MAX WebApp initData.
 * Returns parsed data if valid, null if invalid.
 */
export function validateMaxInitData(
  initDataString: string,
  botToken: string,
): MaxWebAppInitData | null {
  try {
    const params = parseInitData(initDataString);
    const hash = params.hash;

    if (!hash) {
      logger.warn({}, 'No hash in initData');
      return null;
    }

    // auth_date is in SECONDS (standard Unix timestamp), same as Telegram
    const authDate = parseInt(params.auth_date); // seconds
    const nowSeconds = Math.floor(Date.now() / 1000);
    const maxAgeSec = 24 * 60 * 60; // 24 hours

    if (nowSeconds - authDate > maxAgeSec) {
      logger.warn({ authDate, nowSeconds, diffHours: Math.round((nowSeconds - authDate) / 3600) }, 'initData expired');
      return null;
    }

    // Build data-check-string: sort keys alphabetically (excluding hash), join with \n
    const dataCheckString = Object.keys(params)
      .filter(key => key !== 'hash')
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('\n');

    // secret_key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // calculated_hash = HMAC_SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      logger.warn({
        calculated: calculatedHash.substring(0, 10) + '...',
        received: hash.substring(0, 10) + '...',
      }, 'Hash mismatch — invalid initData signature');
      return null;
    }

    let user: MaxWebAppUser | undefined;
    if (params.user) {
      try {
        user = JSON.parse(params.user);
      } catch {
        logger.warn({}, 'Failed to parse user JSON in initData');
      }
    }

    let chat: { id: number; type: string } | undefined;
    if (params.chat) {
      try {
        chat = JSON.parse(params.chat);
      } catch {
        // ignore
      }
    }

    return {
      query_id: params.query_id,
      user,
      chat,
      auth_date: authDate,
      hash,
      start_param: params.start_param,
    };
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Unexpected error validating initData');
    return null;
  }
}

export function extractEventId(startParam: string | undefined): string | null {
  if (!startParam) return null;
  if (startParam.startsWith('e-')) return startParam.substring(2);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(startParam)) return startParam;
  return null;
}

export function getMaxEventBotToken(): string | null {
  return process.env.MAX_EVENT_BOT_TOKEN || null;
}

export function getMaxEventBotUsername(): string {
  return process.env.MAX_EVENT_BOT_USERNAME || 'orbo_event_bot';
}

export function generateMaxEventMiniAppLink(eventId: string): string {
  const botUsername = getMaxEventBotUsername();
  return `https://max.ru/${botUsername}?startapp=e-${eventId}`;
}

export function getMaxMainBotUsername(): string {
  return process.env.MAX_MAIN_BOT_USERNAME || '';
}

export function generateMaxFormMiniAppLink(formId: string): string | null {
  const botUsername = getMaxMainBotUsername();
  if (!botUsername) return null;
  return `https://max.ru/${botUsername}?startapp=apply-${formId}`;
}
