/**
 * Webhook Processing Service
 * 
 * Optimized message processing using database RPC.
 * Reduces 8-12 DB roundtrips to 1-2 calls.
 * 
 * Portable: Uses standard PostgreSQL functions that work with any PG client.
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('WebhookProcessor');

// Hybrid клиент (PostgreSQL для DB)
const supabaseAdmin = createAdminServer();

export interface WebhookMessageData {
  orgId: string;
  tgUserId: number;
  tgChatId: number;
  messageId: number;
  messageThreadId?: number | null;
  replyToMessageId?: number | null;
  replyToUserId?: number | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  hasMedia?: boolean;
  charsCount?: number;
  linksCount?: number;
  mentionsCount?: number;
  reactionsCount?: number;
  meta?: Record<string, any>;
}

export interface ProcessingResult {
  success: boolean;
  participantId?: string;
  isNewParticipant?: boolean;
  isNewGroupLink?: boolean;
  activityEventId?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Check if webhook update was already processed (idempotency)
 */
export async function isWebhookProcessed(updateId: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_webhook_processed', {
      p_update_id: updateId
    });
    
    if (error) {
      logger.warn({ error: error.message, update_id: updateId }, 'Idempotency check failed, assuming not processed');
      return false;
    }
    
    return data === true;
  } catch (err) {
    logger.warn({ error: err, update_id: updateId }, 'Idempotency check exception');
    return false;
  }
}

/**
 * Record webhook as processed (for idempotency)
 */
export async function recordWebhookProcessed(
  updateId: number,
  tgChatId: number,
  eventType: string = 'message',
  orgId?: string | null
): Promise<void> {
  try {
    await supabaseAdmin.rpc('record_webhook_processed', {
      p_update_id: updateId,
      p_tg_chat_id: tgChatId,
      p_event_type: eventType,
      p_org_id: orgId || null
    });
  } catch (err) {
    // Non-critical - just log
    logger.warn({ error: err, update_id: updateId }, 'Failed to record webhook processing');
  }
}

/**
 * Process webhook message using optimized RPC
 * Combines: participant upsert, group link, activity event insert
 * 
 * Before: 8-12 DB roundtrips (~100-150ms)
 * After: 1 RPC call (~10-20ms)
 */
export async function processWebhookMessage(data: WebhookMessageData): Promise<ProcessingResult> {
  const startTime = Date.now();
  
  try {
    const { data: result, error } = await supabaseAdmin.rpc('process_webhook_message', {
      p_org_id: data.orgId,
      p_tg_user_id: data.tgUserId,
      p_tg_chat_id: data.tgChatId,
      p_message_id: data.messageId,
      p_message_thread_id: data.messageThreadId || null,
      p_reply_to_message_id: data.replyToMessageId || null,
      p_reply_to_user_id: data.replyToUserId || null,
      p_username: data.username || null,
      p_first_name: data.firstName || null,
      p_last_name: data.lastName || null,
      p_full_name: data.fullName || null,
      p_has_media: data.hasMedia || false,
      p_chars_count: data.charsCount || 0,
      p_links_count: data.linksCount || 0,
      p_mentions_count: data.mentionsCount || 0,
      p_reactions_count: data.reactionsCount || 0,
      p_meta: data.meta || {}
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      logger.error({ 
        error: error.message,
        duration_ms: duration,
        tg_user_id: data.tgUserId,
        tg_chat_id: data.tgChatId
      }, 'RPC process_webhook_message failed');
      
      return {
        success: false,
        error: error.message,
        errorCode: error.code
      };
    }
    
    // Check for error in result
    if (result?.error) {
      logger.error({
        error: result.error,
        error_code: result.error_code,
        duration_ms: duration
      }, 'RPC returned error');
      
      return {
        success: false,
        error: result.error,
        errorCode: result.error_code
      };
    }
    
    logger.debug({
      participant_id: result?.participant_id,
      is_new: result?.is_new_participant,
      duration_ms: duration
    }, 'Message processed via RPC');
    
    return {
      success: true,
      participantId: result?.participant_id,
      isNewParticipant: result?.is_new_participant,
      isNewGroupLink: result?.is_new_group_link,
      activityEventId: result?.activity_event_id
    };
    
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.error({
      error: err.message || String(err),
      duration_ms: duration,
      tg_user_id: data.tgUserId,
      tg_chat_id: data.tgChatId
    }, 'processWebhookMessage exception');
    
    return {
      success: false,
      error: err.message || String(err)
    };
  }
}

/**
 * Build meta object for activity event
 */
export function buildMessageMeta(message: any, mediaType: string | null): Record<string, any> {
  const messageText = message.text || '';
  const textPreview = messageText.substring(0, 500);
  
  const reactionsCount = message.reactions?.reduce(
    (sum: number, r: any) => sum + (r.count || 0), 
    0
  ) || 0;
  
  return {
    user: {
      name: `${message.from?.first_name || ''} ${message.from?.last_name || ''}`.trim(),
      username: message.from?.username,
      tg_user_id: message.from?.id
    },
    message: {
      id: message.message_id,
      thread_id: message.message_thread_id || null,
      reply_to_id: message.reply_to_message?.message_id || null,
      text_preview: textPreview,
      text_length: messageText.length,
      has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
      media_type: mediaType,
      is_topic_message: message.is_topic_message ?? false
    },
    reactions: reactionsCount > 0 ? {
      total_count: reactionsCount,
      reaction_types: message.reactions?.map((r: any) => r.type?.emoji || r.type) || []
    } : undefined,
    source: {
      type: 'webhook'
    }
  };
}

/**
 * Extract media type from message
 */
export function getMediaType(message: any): string | null {
  if (message.photo) return 'photo';
  if (message.video) return 'video';
  if (message.document) return 'document';
  if (message.audio) return 'audio';
  if (message.voice) return 'voice';
  if (message.sticker) return 'sticker';
  return null;
}

/**
 * Count entities in message
 */
export function countMessageEntities(message: any): { linksCount: number; mentionsCount: number } {
  let linksCount = 0;
  let mentionsCount = 0;
  
  if (message.entities) {
    for (const entity of message.entities) {
      if (entity.type === 'url') linksCount++;
      if (entity.type === 'mention' || entity.type === 'text_mention') mentionsCount++;
    }
  }
  
  return { linksCount, mentionsCount };
}

/**
 * Full message processing helper
 * Combines all steps into single function
 */
export async function processMessage(
  orgId: string,
  message: any,
  updateId?: number
): Promise<ProcessingResult> {
  const from = message.from;
  
  // System accounts to skip (Telegram service, bots, anonymous)
  const SYSTEM_ACCOUNT_IDS = [
    777000,      // Telegram Service Notifications
    136817688,   // @Channel_Bot
    1087968824   // Group Anonymous Bot
  ];
  
  if (!from || from.is_bot || SYSTEM_ACCOUNT_IDS.includes(from.id)) {
    logger.debug({ user_id: from?.id, is_bot: from?.is_bot }, 'Skipping system account or bot');
    return { success: true }; // Skip bots and system accounts
  }
  
  // Check idempotency if updateId provided
  if (updateId) {
    const isProcessed = await isWebhookProcessed(updateId);
    if (isProcessed) {
      logger.debug({ update_id: updateId }, 'Duplicate update, skipping');
      return { success: true };
    }
  }
  
  const mediaType = getMediaType(message);
  const { linksCount, mentionsCount } = countMessageEntities(message);
  const meta = buildMessageMeta(message, mediaType);
  
  const messageText = message.text || '';
  const reactionsCount = message.reactions?.reduce(
    (sum: number, r: any) => sum + (r.count || 0), 
    0
  ) || 0;
  
  const result = await processWebhookMessage({
    orgId,
    tgUserId: from.id,
    tgChatId: message.chat.id,
    messageId: message.message_id,
    messageThreadId: message.message_thread_id || null,
    replyToMessageId: message.reply_to_message?.message_id || null,
    replyToUserId: message.reply_to_message?.from?.id || null,
    username: from.username || null,
    firstName: from.first_name || null,
    lastName: from.last_name || null,
    fullName: `${from.first_name || ''} ${from.last_name || ''}`.trim() || null,
    hasMedia: !!mediaType,
    charsCount: messageText.length,
    linksCount,
    mentionsCount,
    reactionsCount,
    meta
  });
  
  // Record idempotency
  if (updateId && result.success) {
    await recordWebhookProcessed(updateId, message.chat.id, 'message', orgId);
  }
  
  return result;
}

