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

/**
 * Validate Telegram WebApp initData
 * Returns parsed data if valid, null if invalid
 */
export function validateInitData(
  initDataString: string,
  botToken: string
): TelegramWebAppInitData | null {
  try {
    const params = parseInitData(initDataString);
    const hash = params.hash;
    
    if (!hash) {
      console.error('[WebAppAuth] No hash in initData');
      return null;
    }
    
    // Check auth_date is not too old (allow 24 hours)
    const authDate = parseInt(params.auth_date);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours
    
    if (now - authDate > maxAge) {
      console.error('[WebAppAuth] initData expired', { authDate, now, diff: now - authDate });
      return null;
    }
    
    // Create data-check-string
    // Sort alphabetically and join with \n
    const dataCheckString = Object.keys(params)
      .filter(key => key !== 'hash')
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('\n');
    
    // Calculate secret key: HMAC-SHA256(botToken, "WebAppData")
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    // Calculate hash: HMAC-SHA256(dataCheckString, secretKey)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    // Validate hash
    if (calculatedHash !== hash) {
      console.error('[WebAppAuth] Hash mismatch', { 
        calculated: calculatedHash.substring(0, 10) + '...', 
        received: hash.substring(0, 10) + '...' 
      });
      return null;
    }
    
    // Parse user JSON
    let user: TelegramWebAppUser | undefined;
    if (params.user) {
      try {
        user = JSON.parse(params.user);
      } catch (e) {
        console.error('[WebAppAuth] Failed to parse user JSON', e);
      }
    }
    
    return {
      query_id: params.query_id,
      user,
      auth_date: authDate,
      hash,
      start_param: params.start_param,
    };
  } catch (error) {
    console.error('[WebAppAuth] Validation error', error);
    return null;
  }
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

