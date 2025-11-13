/**
 * Telegram Notifications Service for Orbo Apps
 * 
 * Handles notifications for app items:
 * - Approved item → post to Telegram group
 * - Rejected item → DM to creator
 */

import { createAdminServer } from '@/lib/server/supabaseServer';

interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id: number;
    chat: { id: number; title?: string };
  };
  description?: string;
}

/**
 * Send message to Telegram (group or DM)
 */
async function sendTelegramMessage(
  botToken: string,
  payload: {
    chat_id: number | string;
    text: string;
    parse_mode?: 'HTML' | 'Markdown';
    disable_web_page_preview?: boolean;
    reply_markup?: any;
  }
): Promise<TelegramResponse> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return response.json();
}

/**
 * Post approved item to Telegram group
 * 
 * @param itemId - App item ID
 * @returns Success status and message ID
 */
export async function notifyItemApproved(itemId: string): Promise<{
  success: boolean;
  messageId?: number;
  error?: string;
}> {
  try {
    const adminSupabase = createAdminServer();

    // Fetch item with app and org details
    const { data: item, error: itemError } = await adminSupabase
      .from('app_items')
      .select(`
        id,
        data,
        collection_id,
        org_id,
        creator_id,
        app_collections!inner(
          app_id,
          display_name,
          apps!inner(
            name,
            icon,
            org_id,
            organizations!inner(
              name,
              slug
            )
          )
        ),
        participants!creator_id(
          id,
          username,
          tg_user_id
        )
      `)
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.error('[AppsNotification] Item not found:', itemError);
      return { success: false, error: 'Item not found' };
    }

    // Get Telegram groups for this org
    const { data: groups, error: groupsError } = await adminSupabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', item.org_id)
      .eq('is_active', true);

    if (groupsError || !groups || groups.length === 0) {
      console.error('[AppsNotification] No active Telegram groups found');
      return { success: false, error: 'No Telegram groups configured' };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[AppsNotification] TELEGRAM_BOT_TOKEN not configured');
      return { success: false, error: 'Bot not configured' };
    }

    // Extract data from JSONB
    const itemData = item.data as any;
    const app = (item.app_collections as any).apps;
    const org = app.organizations;
    const creator = item.participants as any;

    // Build message
    const title = itemData.title || 'Без названия';
    const description = itemData.description || '';
    const category = itemData.category || '';
    const price = itemData.price ? `💰 ${itemData.price} ₽` : '';
    const imageUrl = itemData.image_url || '';
    const phone = itemData.phone || '';

    // Public URL for item
    const itemUrl = `https://app.orbo.ru/p/${org.slug}/apps/${(item.app_collections as any).app_id}/items/${item.id}`;

    let message = `${app.icon || '📦'} <b>${title}</b>\n\n`;
    
    if (description) {
      message += `${description.slice(0, 300)}${description.length > 300 ? '...' : ''}\n\n`;
    }

    if (category) {
      message += `📂 ${category}\n`;
    }

    if (price) {
      message += `${price}\n`;
    }

    if (phone) {
      message += `📞 ${phone}\n`;
    }

    if (creator?.username) {
      message += `👤 @${creator.username}\n`;
    }

    message += `\n<a href="${itemUrl}">Подробнее →</a>`;

    // Inline buttons
    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: '📖 Открыть',
            url: itemUrl,
          },
          ...(creator?.username
            ? [
                {
                  text: '💬 Написать',
                  url: `https://t.me/${creator.username}`,
                },
              ]
            : []),
        ],
        [
          {
            text: `📱 Все объявления в ${app.name}`,
            url: `https://app.orbo.ru/p/${org.slug}/apps/${(item.app_collections as any).app_id}`,
          },
        ],
      ],
    };

    // Send to all groups
    const results = [];
    for (const group of groups) {
      try {
        const telegramResponse = await sendTelegramMessage(botToken, {
          chat_id: group.tg_chat_id,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: !imageUrl, // Show preview if image exists
          reply_markup: inlineKeyboard,
        });

        if (telegramResponse.ok) {
          console.log(
            `[AppsNotification] Item ${itemId} posted to group ${group.tg_chat_id}`
          );
          results.push({
            groupId: group.id,
            success: true,
            messageId: telegramResponse.result?.message_id,
          });
        } else {
          console.error(
            `[AppsNotification] Failed to post to group ${group.tg_chat_id}:`,
            telegramResponse.description
          );
          results.push({
            groupId: group.id,
            success: false,
            error: telegramResponse.description,
          });
        }
      } catch (error) {
        console.error(`[AppsNotification] Error posting to group ${group.id}:`, error);
        results.push({
          groupId: group.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return {
      success: successCount > 0,
      messageId: results.find((r) => r.success)?.messageId,
      error: successCount === 0 ? 'Failed to post to any group' : undefined,
    };
  } catch (error) {
    console.error('[AppsNotification] Error in notifyItemApproved:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send DM to creator when item is rejected
 * 
 * @param itemId - App item ID
 * @param rejectionReason - Optional reason for rejection
 * @returns Success status
 */
export async function notifyItemRejected(
  itemId: string,
  rejectionReason?: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const adminSupabase = createAdminServer();

    // Fetch item with creator details
    const { data: item, error: itemError } = await adminSupabase
      .from('app_items')
      .select(`
        id,
        data,
        collection_id,
        org_id,
        creator_id,
        app_collections!inner(
          app_id,
          display_name,
          apps!inner(
            name,
            icon,
            org_id,
            organizations!inner(
              name,
              slug
            )
          )
        ),
        participants!creator_id(
          id,
          username,
          tg_user_id
        )
      `)
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.error('[AppsNotification] Item not found:', itemError);
      return { success: false, error: 'Item not found' };
    }

    const creator = item.participants as any;
    if (!creator?.tg_user_id) {
      console.error('[AppsNotification] Creator Telegram ID not found');
      return { success: false, error: 'Creator Telegram ID not found' };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[AppsNotification] TELEGRAM_BOT_TOKEN not configured');
      return { success: false, error: 'Bot not configured' };
    }

    // Extract data
    const itemData = item.data as any;
    const app = (item.app_collections as any).apps;
    const org = app.organizations;

    const title = itemData.title || 'Без названия';

    // Build message
    let message = `❌ <b>Объявление отклонено</b>\n\n`;
    message += `📌 <b>${title}</b>\n`;
    message += `📱 Приложение: ${app.name}\n\n`;

    if (rejectionReason) {
      message += `<b>Причина:</b>\n${rejectionReason}\n\n`;
    }

    message += `Вы можете отредактировать объявление и отправить на модерацию снова.\n\n`;
    message += `Если у вас есть вопросы, свяжитесь с администратором сообщества.`;

    // Inline buttons
    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: '📱 Перейти в приложение',
            url: `https://app.orbo.ru/p/${org.slug}/apps/${(item.app_collections as any).app_id}`,
          },
        ],
      ],
    };

    // Send DM
    try {
      const telegramResponse = await sendTelegramMessage(botToken, {
        chat_id: creator.tg_user_id,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: inlineKeyboard,
      });

      if (telegramResponse.ok) {
        console.log(`[AppsNotification] Rejection DM sent to user ${creator.tg_user_id}`);
        return { success: true };
      } else {
        console.error(
          `[AppsNotification] Failed to send DM to user ${creator.tg_user_id}:`,
          telegramResponse.description
        );
        return {
          success: false,
          error: telegramResponse.description || 'Failed to send DM',
        };
      }
    } catch (error) {
      console.error('[AppsNotification] Error sending DM:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  } catch (error) {
    console.error('[AppsNotification] Error in notifyItemRejected:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

