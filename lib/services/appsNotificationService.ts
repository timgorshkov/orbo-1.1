/**
 * Telegram Notifications Service for Orbo Apps
 * 
 * Handles notifications for app items:
 * - Approved item → post to Telegram group
 * - Rejected item → DM to creator
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('AppsNotification');

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

    // Fetch item with app and org details (step by step, without JOINs)
    const { data: itemBase, error: itemError } = await adminSupabase
      .from('app_items')
      .select('id, data, collection_id, org_id, creator_id')
      .eq('id', itemId)
      .single();

    if (itemError || !itemBase) {
      logger.error({ item_id: itemId, error: itemError?.message }, 'Item not found');
      return { success: false, error: 'Item not found' };
    }

    // Получаем связанные данные
    const [collectionResult, creatorResult] = await Promise.all([
      adminSupabase.from('app_collections').select('app_id, display_name').eq('id', itemBase.collection_id).single(),
      itemBase.creator_id ? adminSupabase.from('participants').select('id, username, tg_user_id').eq('id', itemBase.creator_id).single() : null
    ]);

    const collection = collectionResult?.data;
    let app = null;
    let org = null;

    if (collection?.app_id) {
      const { data: appData } = await adminSupabase.from('apps').select('name, icon, org_id').eq('id', collection.app_id).single();
      app = appData;
      if (app?.org_id) {
        const { data: orgData } = await adminSupabase.from('organizations').select('name, slug').eq('id', app.org_id).single();
        org = orgData;
      }
    }

    // Собираем item в формате, совместимом с предыдущим кодом
    const item = {
      ...itemBase,
      app_collections: collection ? {
        ...collection,
        apps: app ? { ...app, organizations: org } : null
      } : null,
      participants: creatorResult?.data || null
    };

    // Get Telegram groups for this org
    const { data: groups, error: groupsError } = await adminSupabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', item.org_id)
      .eq('is_active', true);

    if (groupsError || !groups || groups.length === 0) {
      logger.error({ org_id: item.org_id }, 'No active Telegram groups found');
      return { success: false, error: 'No Telegram groups configured' };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.error({}, 'TELEGRAM_BOT_TOKEN not configured');
      return { success: false, error: 'Bot not configured' };
    }

    // Extract data from JSONB
    const itemData = item.data as any;
    const appInfo = (item.app_collections as any).apps;
    const orgInfo = appInfo.organizations;
    const creator = item.participants as any;

    // Build message
    const title = itemData.title || 'Без названия';
    const description = itemData.description || '';
    const category = itemData.category || '';
    const price = itemData.price ? `💰 ${itemData.price} ₽` : '';
    const imageUrl = itemData.image_url || '';
    const phone = itemData.phone || '';

    // Public URL for item
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    const itemUrl = `${baseUrl}/p/${orgInfo.slug}/apps/${(item.app_collections as any).app_id}/items/${item.id}`;

    let message = `${appInfo.icon || '📦'} <b>${title}</b>\n\n`;
    
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
            text: `📱 Все объявления в ${appInfo.name}`,
            url: `${baseUrl}/p/${orgInfo.slug}/apps/${(item.app_collections as any).app_id}`,
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
          logger.info({ 
            item_id: itemId,
            group_id: group.id,
            tg_chat_id: group.tg_chat_id,
            message_id: telegramResponse.result?.message_id
          }, 'Item posted to group');
          results.push({
            groupId: group.id,
            success: true,
            messageId: telegramResponse.result?.message_id,
          });
        } else {
          logger.error({ 
            item_id: itemId,
            group_id: group.id,
            tg_chat_id: group.tg_chat_id,
            error: telegramResponse.description
          }, 'Failed to post to group');
          results.push({
            groupId: group.id,
            success: false,
            error: telegramResponse.description,
          });
        }
      } catch (error) {
        logger.error({ 
          item_id: itemId,
          group_id: group.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, 'Error posting to group');
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
    logger.error({ 
      item_id: itemId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error in notifyItemApproved');
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

    // Fetch item with creator details (step by step, without JOINs)
    const { data: itemBase, error: itemError } = await adminSupabase
      .from('app_items')
      .select('id, data, collection_id, org_id, creator_id')
      .eq('id', itemId)
      .single();

    if (itemError || !itemBase) {
      logger.error({ item_id: itemId, error: itemError?.message }, 'Item not found');
      return { success: false, error: 'Item not found' };
    }

    // Получаем связанные данные
    const [collectionResult, creatorResult] = await Promise.all([
      adminSupabase.from('app_collections').select('app_id, display_name').eq('id', itemBase.collection_id).single(),
      itemBase.creator_id ? adminSupabase.from('participants').select('id, username, tg_user_id').eq('id', itemBase.creator_id).single() : null
    ]);

    const collection = collectionResult?.data;
    let app = null;
    let org = null;

    if (collection?.app_id) {
      const { data: appData } = await adminSupabase.from('apps').select('name, icon, org_id').eq('id', collection.app_id).single();
      app = appData;
      if (app?.org_id) {
        const { data: orgData } = await adminSupabase.from('organizations').select('name, slug').eq('id', app.org_id).single();
        org = orgData;
      }
    }

    // Собираем item в формате, совместимом с предыдущим кодом
    const item = {
      ...itemBase,
      app_collections: collection ? {
        ...collection,
        apps: app ? { ...app, organizations: org } : null
      } : null,
      participants: creatorResult?.data || null
    };

    const creator = item.participants as any;
    if (!creator?.tg_user_id) {
      logger.error({ item_id: itemId }, 'Creator Telegram ID not found');
      return { success: false, error: 'Creator Telegram ID not found' };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.error({}, 'TELEGRAM_BOT_TOKEN not configured');
      return { success: false, error: 'Bot not configured' };
    }

    // Extract data
    const itemData = item.data as any;
    const appInfo2 = (item.app_collections as any).apps;
    const orgInfo2 = appInfo2.organizations;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';

    const title = itemData.title || 'Без названия';

    // Build message
    let message = `❌ <b>Объявление отклонено</b>\n\n`;
    message += `📌 <b>${title}</b>\n`;
    message += `📱 Приложение: ${appInfo2.name}\n\n`;

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
            url: `${baseUrl}/p/${orgInfo2.slug}/apps/${(item.app_collections as any).app_id}`,
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
        logger.info({ 
          item_id: itemId,
          tg_user_id: creator.tg_user_id
        }, 'Rejection DM sent');
        return { success: true };
      } else {
        logger.error({ 
          item_id: itemId,
          tg_user_id: creator.tg_user_id,
          error: telegramResponse.description
        }, 'Failed to send DM');
        return {
          success: false,
          error: telegramResponse.description || 'Failed to send DM',
        };
      }
    } catch (error) {
      logger.error({ 
        item_id: itemId,
        tg_user_id: creator.tg_user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Error sending DM');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  } catch (error) {
    logger.error({ 
      item_id: itemId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error in notifyItemRejected');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

