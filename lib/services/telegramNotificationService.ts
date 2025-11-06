/**
 * Telegram Notification Service
 * Sends messages via orbo_assist_bot
 * 
 * Used for:
 * - Weekly digests
 * - System notifications
 * - Alerts
 */

interface TelegramSendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: 'Markdown' | 'HTML';
  disable_web_page_preview?: boolean;
}

interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id: number;
    chat: {
      id: number;
    };
  };
  description?: string;
  error_code?: number;
}

/**
 * Send message via Telegram Bot API
 */
async function sendTelegramMessage(
  botToken: string,
  params: TelegramSendMessageParams
): Promise<TelegramResponse> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  return await response.json();
}

/**
 * Check if user can receive DMs from bot
 */
async function checkBotAccess(
  botToken: string,
  userId: number
): Promise<{ canSendDM: boolean; reason?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getChat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: userId }),
    });

    const data: TelegramResponse = await response.json();

    if (data.ok) {
      return { canSendDM: true };
    } else {
      // Common error codes:
      // 400: user not found / bot not started
      // 403: bot was blocked by user
      if (data.error_code === 400) {
        return { canSendDM: false, reason: 'User has not started the bot' };
      } else if (data.error_code === 403) {
        return { canSendDM: false, reason: 'Bot was blocked by user' };
      } else {
        return { canSendDM: false, reason: data.description || 'Unknown error' };
      }
    }
  } catch (error) {
    console.error('[TelegramNotification] Failed to check bot access:', error);
    return { canSendDM: false, reason: 'Network error' };
  }
}

/**
 * Send digest DM to user
 */
export async function sendDigestDM(
  tgUserId: number,
  digestText: string
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const botToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;

  if (!botToken) {
    console.error('[TelegramNotification] TELEGRAM_NOTIFICATIONS_BOT_TOKEN not configured');
    return { success: false, error: 'Bot token not configured' };
  }

  // Check if we can send DM
  const accessCheck = await checkBotAccess(botToken, tgUserId);
  if (!accessCheck.canSendDM) {
    console.warn(`[TelegramNotification] Cannot send DM to ${tgUserId}: ${accessCheck.reason}`);
    return { success: false, error: accessCheck.reason };
  }

  // Send message
  try {
    const response = await sendTelegramMessage(botToken, {
      chat_id: tgUserId,
      text: digestText,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    if (response.ok && response.result) {
      console.log(`[TelegramNotification] Digest sent to ${tgUserId}, message_id: ${response.result.message_id}`);
      return {
        success: true,
        messageId: response.result.message_id,
      };
    } else {
      console.error(`[TelegramNotification] Failed to send to ${tgUserId}:`, response.description);
      return {
        success: false,
        error: response.description || 'Unknown error',
      };
    }
  } catch (error) {
    console.error('[TelegramNotification] Error sending message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send batch of digests to multiple users
 */
export async function sendDigestBatch(
  recipients: Array<{ tgUserId: number; name: string }>,
  digestText: string
): Promise<{
  total: number;
  sent: number;
  failed: number;
  results: Array<{ tgUserId: number; name: string; success: boolean; error?: string }>;
}> {
  console.log(`[TelegramNotification] Sending digest to ${recipients.length} recipients`);

  const results = await Promise.all(
    recipients.map(async (recipient) => {
      const result = await sendDigestDM(recipient.tgUserId, digestText);
      return {
        tgUserId: recipient.tgUserId,
        name: recipient.name,
        success: result.success,
        error: result.error,
      };
    })
  );

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[TelegramNotification] Batch complete: ${sent}/${recipients.length} sent, ${failed} failed`);

  return {
    total: recipients.length,
    sent,
    failed,
    results,
  };
}

/**
 * Send system notification (not digest)
 */
export async function sendSystemNotification(
  tgUserId: number,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const botToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN;

  if (!botToken) {
    return { success: false, error: 'Bot token not configured' };
  }

  try {
    const response = await sendTelegramMessage(botToken, {
      chat_id: tgUserId,
      text: message,
      parse_mode: 'Markdown',
    });

    return {
      success: response.ok,
      error: response.description,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

