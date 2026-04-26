/**
 * Centralised builder for Telegram webhook URLs.
 *
 * When `TELEGRAM_WEBHOOK_RELAY_BASE` is set, all bots receive a Cloudflare
 * Worker URL like `<base>/in/<bot>` instead of a direct origin URL. The Worker
 * forwards inbound updates to our backend. Used because Telegram → my.orbo.ru
 * is unreliable from inside Russian network filtering.
 *
 * Without the env var, falls back to the original direct URLs so dev/local
 * setups keep working as before.
 */

export type WebhookBotType = 'main' | 'registration' | 'notifications' | 'event';

const DIRECT_PATHS: Record<WebhookBotType, string> = {
  main: '/api/telegram/webhook',
  registration: '/api/telegram/registration-bot/webhook',
  notifications: '/api/telegram/notifications/webhook',
  event: '/api/telegram/event-bot/webhook',
};

export function buildWebhookUrl(botType: WebhookBotType): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://my.orbo.ru';
  const relayBase = (process.env.TELEGRAM_WEBHOOK_RELAY_BASE || '').replace(/\/+$/, '');

  if (relayBase) {
    return `${relayBase}/in/${botType}`;
  }
  return `${baseUrl}${DIRECT_PATHS[botType]}`;
}
