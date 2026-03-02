/**
 * Service for interacting with MAX Bot API (platform-api.max.ru)
 */
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('MaxService');

const MAX_API_BASE = 'https://platform-api.max.ru';

export type MaxBotType = 'main' | 'event' | 'notifications';

export class MaxService {
  private token: string;
  private botType: MaxBotType;

  constructor(botType: MaxBotType = 'main') {
    this.botType = botType;

    let token: string | undefined;
    switch (botType) {
      case 'main':
        token = process.env.MAX_MAIN_BOT_TOKEN;
        break;
      case 'event':
        token = process.env.MAX_EVENT_BOT_TOKEN;
        break;
      case 'notifications':
        token = process.env.MAX_NOTIFICATIONS_BOT_TOKEN;
        break;
    }

    if (!token) {
      throw new Error(`MAX token not provided for bot type: ${botType}`);
    }

    this.token = token;
    logger.debug({ bot_type: botType, token_prefix: token.substring(0, 8) }, 'MaxService initialized');
  }

  private async callApi(method: string, httpMethod: string = 'GET', body?: object): Promise<any> {
    const url = `${MAX_API_BASE}/${method}`;

    const headers: Record<string, string> = {
      'Authorization': this.token,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method: httpMethod, headers };
    if (body && (httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const startTime = Date.now();
    try {
      const response = await fetch(url, options);
      const elapsed = Date.now() - startTime;
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        logger.error({
          method, httpMethod, status: response.status,
          error: data, elapsed_ms: elapsed, bot_type: this.botType,
        }, `MAX API error: ${method}`);
        return { ok: false, error: data, status: response.status };
      }

      logger.debug({ method, httpMethod, elapsed_ms: elapsed, bot_type: this.botType }, `MAX API call: ${method}`);
      return { ok: true, data, status: response.status };
    } catch (error: any) {
      logger.error({ method, httpMethod, error: error.message, bot_type: this.botType }, `MAX API network error: ${method}`);
      return { ok: false, error: error.message, status: 0 };
    }
  }

  /** GET /me - get bot info */
  async getMe() {
    return this.callApi('me');
  }

  /** POST /messages - send text message to a chat */
  async sendMessageToChat(chatId: number, text: string, options: {
    format?: 'markdown' | 'html';
    attachments?: any[];
    link?: { type: string; mid: string };
    notify?: boolean;
  } = {}) {
    const body: any = {
      chat_id: chatId,
      text,
    };
    if (options.format) body.format = options.format;
    if (options.attachments) body.attachments = options.attachments;
    if (options.link) body.link = options.link;
    if (options.notify !== undefined) body.notify = options.notify;

    return this.callApi('messages', 'POST', body);
  }

  /** POST /messages - send message to a user (DM) */
  async sendMessageToUser(userId: number, text: string, options: {
    format?: 'markdown' | 'html';
    attachments?: any[];
  } = {}) {
    const body: any = {
      user_id: userId,
      text,
    };
    if (options.format) body.format = options.format;
    if (options.attachments) body.attachments = options.attachments;

    return this.callApi('messages', 'POST', body);
  }

  /** GET /chats/{chatId} - get chat info */
  async getChat(chatId: number) {
    return this.callApi(`chats/${chatId}`);
  }

  /** GET /chats/{chatId}/members - get chat members */
  async getChatMembers(chatId: number, params: { marker?: number; count?: number } = {}) {
    const query = new URLSearchParams();
    if (params.marker) query.set('marker', String(params.marker));
    if (params.count) query.set('count', String(params.count));
    const qs = query.toString();
    return this.callApi(`chats/${chatId}/members${qs ? '?' + qs : ''}`);
  }

  /** POST /subscriptions - set webhook */
  async setWebhook(url: string, updateTypes?: string[], secret?: string) {
    const body: any = { url };
    if (updateTypes) body.update_types = updateTypes;
    if (secret) body.secret = secret;
    return this.callApi('subscriptions', 'POST', body);
  }

  /** DELETE /subscriptions - remove webhook */
  async deleteWebhook(url: string) {
    return this.callApi(`subscriptions?url=${encodeURIComponent(url)}`, 'DELETE');
  }

  /** GET /subscriptions - get current webhooks */
  async getWebhooks() {
    return this.callApi('subscriptions');
  }

  /** Build inline keyboard with open_app button */
  static buildOpenAppKeyboard(buttonText: string, webAppUrl?: string): any {
    return {
      type: 'inline_keyboard',
      payload: {
        buttons: [[
          {
            type: 'open_app',
            text: buttonText,
            ...(webAppUrl ? { url: webAppUrl } : {}),
          },
        ]],
      },
    };
  }

  /** Build inline keyboard with callback buttons */
  static buildCallbackKeyboard(buttons: { text: string; payload: string }[][]): any {
    return {
      type: 'inline_keyboard',
      payload: {
        buttons: buttons.map(row =>
          row.map(btn => ({
            type: 'callback',
            text: btn.text,
            payload: btn.payload,
          }))
        ),
      },
    };
  }
}

export function createMaxService(botType: MaxBotType = 'main'): MaxService {
  return new MaxService(botType);
}
