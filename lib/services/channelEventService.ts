/**
 * Channel Event Processing Service
 * 
 * Handles Telegram channel events:
 * - channel_post: New post in channel
 * - edited_channel_post: Post updated (views, forwards)
 * - message_reaction: Reaction on channel post
 * - chat_member: Subscriber join/leave (for channels)
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('ChannelEventService');

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: any[];
  video?: any;
  document?: any;
  audio?: any;
  animation?: any;
  views?: number;
  forward_count?: number;
  sender_chat?: TelegramChat;
}

interface TelegramReaction {
  chat: TelegramChat;
  message_id: number;
  user?: TelegramUser;
  old_reaction: any[];
  new_reaction: any[];
}

/**
 * Process new channel post
 */
export async function processChannelPost(post: TelegramMessage): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminServer();
  
  try {
    const chatId = post.chat.id;
    const chatType = post.chat.type;
    
    logger.info({
      chat_id: chatId,
      chat_type: chatType,
      message_id: post.message_id,
      chat_title: post.chat.title,
      chat_username: post.chat.username,
      has_text: !!post.text,
      has_caption: !!post.caption,
      text_preview: (post.text || post.caption || '').substring(0, 50),
      views: post.views,
      date: post.date
    }, '📢 [CHANNEL] Processing channel post');
    
    // Only process channel posts
    if (chatType !== 'channel') {
      logger.debug({ chat_type: chatType }, '⏭️ [CHANNEL] Skipping - not a channel');
      return { success: true };
    }
    
    // Check if channel is tracked
    const { data: orgBindings } = await supabase
      .from('org_telegram_channels')
      .select('org_id, channel_id')
      .eq('channel_id', (
        await supabase
          .from('telegram_channels')
          .select('id')
          .eq('tg_chat_id', chatId)
          .single()
      ).data?.id);
    
    // If channel not tracked by any org, create it anyway for future tracking
    // Determine media type
    let mediaType: string | null = null;
    let hasMedia = false;
    
    if (post.photo && post.photo.length > 0) {
      mediaType = 'photo';
      hasMedia = true;
    } else if (post.video) {
      mediaType = 'video';
      hasMedia = true;
    } else if (post.animation) {
      mediaType = 'animation';
      hasMedia = true;
    } else if (post.audio) {
      mediaType = 'audio';
      hasMedia = true;
    } else if (post.document) {
      mediaType = 'document';
      hasMedia = true;
    }
    
    // Upsert channel first
    logger.info({ 
      chat_id: chatId, 
      title: post.chat.title,
      username: post.chat.username 
    }, '🔄 [CHANNEL] Upserting channel');
    
    const { data: rpcChannelResult, error: channelError } = await supabase
      .rpc('upsert_telegram_channel', {
        p_tg_chat_id: chatId,
        p_title: post.chat.title || `Channel ${chatId}`,
        p_username: post.chat.username || null
      });
    
    if (channelError) {
      logger.error({ error: channelError, chat_id: chatId }, '❌ [CHANNEL] Failed to upsert channel');
      return { success: false, error: channelError.message };
    }
    
    // Extract channel ID from RPC result
    let channelId: string;
    if (typeof rpcChannelResult === 'string') {
      channelId = rpcChannelResult;
    } else if (Array.isArray(rpcChannelResult) && rpcChannelResult.length > 0) {
      const firstItem = rpcChannelResult[0];
      channelId = firstItem.upsert_telegram_channel || firstItem.id || firstItem;
    } else if (rpcChannelResult && typeof rpcChannelResult === 'object') {
      channelId = (rpcChannelResult as any).upsert_telegram_channel || (rpcChannelResult as any).id;
    } else {
      logger.error({ rpc_result: rpcChannelResult }, '❌ [CHANNEL] Unexpected RPC result format for channel upsert');
      return { success: false, error: 'Failed to get channel ID' };
    }
    
    logger.info({ channel_id: channelId, chat_id: chatId }, '✅ [CHANNEL] Channel upserted');
    
    // Upsert post
    logger.info({ 
      chat_id: chatId,
      channel_id: channelId,
      message_id: post.message_id,
      has_media: hasMedia,
      media_type: mediaType,
      views: post.views || 0
    }, '🔄 [CHANNEL] Upserting post');
    
    const { data: postResult, error: postError } = await supabase
      .rpc('upsert_channel_post', {
        p_channel_tg_id: chatId,
        p_message_id: post.message_id,
        p_text: post.text || null,
        p_caption: post.caption || null,
        p_has_media: hasMedia,
        p_media_type: mediaType,
        p_views_count: post.views || 0,
        p_forwards_count: post.forward_count || 0,
        p_posted_at: new Date(post.date * 1000).toISOString()
      });
    
    if (postError) {
      logger.error({ 
        error: postError, 
        chat_id: chatId, 
        message_id: post.message_id,
        error_code: (postError as any).code,
        error_details: (postError as any).details
      }, '❌ [CHANNEL] Failed to upsert post');
      return { success: false, error: postError.message };
    }
    
    logger.info({ 
      chat_id: chatId, 
      message_id: post.message_id,
      post_result: postResult 
    }, '✅ [CHANNEL] Post upserted successfully');
    
    logger.info({
      chat_id: chatId,
      message_id: post.message_id,
      has_media: hasMedia,
      media_type: mediaType
    }, 'Channel post processed');
    
    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error processing channel post');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Process edited channel post (views/forwards update)
 */
export async function processEditedChannelPost(post: TelegramMessage): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminServer();
  
  try {
    const chatId = post.chat.id;
    
    logger.info({
      chat_id: chatId,
      message_id: post.message_id,
      views: post.views,
      forward_count: post.forward_count
    }, '📝 [CHANNEL] Processing edited channel post');
    
    if (post.chat.type !== 'channel') {
      return { success: true };
    }
    
    // Update post stats
    const { error } = await supabase
      .rpc('upsert_channel_post', {
        p_channel_tg_id: chatId,
        p_message_id: post.message_id,
        p_text: post.text || null,
        p_caption: post.caption || null,
        p_views_count: post.views || 0,
        p_forwards_count: post.forward_count || 0,
        p_posted_at: new Date(post.date * 1000).toISOString()
      });
    
    if (error) {
      logger.error({ error, chat_id: chatId, message_id: post.message_id }, 'Failed to update post stats');
      return { success: false, error: error.message };
    }
    
    logger.debug({
      chat_id: chatId,
      message_id: post.message_id,
      views: post.views,
      forwards: post.forward_count
    }, 'Channel post stats updated');
    
    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error processing edited channel post');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Process reaction on channel post
 */
export async function processChannelReaction(reaction: TelegramReaction): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminServer();
  
  try {
    const chatId = reaction.chat.id;
    const chatType = reaction.chat.type;
    
    // Only process channel reactions
    if (chatType !== 'channel') {
      return { success: true };
    }
    
    const userId = reaction.user?.id;
    const newReactions = reaction.new_reaction || [];
    const oldReactions = reaction.old_reaction || [];
    
    logger.info({
      chat_id: chatId,
      message_id: reaction.message_id,
      user_id: userId,
      username: reaction.user?.username,
      new_reactions_count: newReactions.length,
      old_reactions_count: oldReactions.length,
      new_emojis: newReactions.map(r => r.emoji || r.custom_emoji_id).join(', '),
      old_emojis: oldReactions.map(r => r.emoji || r.custom_emoji_id).join(', ')
    }, '❤️ [CHANNEL] Processing channel reaction');
    
    // Add each new reaction
    for (const r of newReactions) {
      const emoji = r.emoji || r.custom_emoji_id || '👍';
      
      const { error } = await supabase
        .rpc('add_channel_post_reaction', {
          p_channel_tg_id: chatId,
          p_message_id: reaction.message_id,
          p_user_id: userId || null,
          p_emoji: emoji,
          p_username: reaction.user?.username || null,
          p_first_name: reaction.user?.first_name || null,
          p_last_name: reaction.user?.last_name || null
        });
      
      if (error) {
        logger.warn({ error, chat_id: chatId, message_id: reaction.message_id }, 'Failed to add reaction');
      }
    }
    
    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error processing channel reaction');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Process channel member update (subscriber join/leave)
 */
export async function processChannelMemberUpdate(update: any): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminServer();
  
  try {
    const chat = update.chat;
    const chatId = chat?.id;
    
    if (!chatId || chat?.type !== 'channel') {
      return { success: true };
    }
    
    // Get member count if available
    // Note: Telegram doesn't always send member count, we may need to fetch it via API
    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;
    
    logger.debug({
      chat_id: chatId,
      old_status: oldStatus,
      new_status: newStatus
    }, 'Processing channel member update');
    
    // Update channel's subscriber count tracking timestamp
    // The actual count would need to be fetched via Telegram API
    await supabase
      .from('telegram_channels')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tg_chat_id', chatId);
    
    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error processing channel member update');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Link channel to its discussion group (for comments)
 */
export async function linkChannelToDiscussionGroup(channelId: number, discussionGroupId: number): Promise<void> {
  const supabase = createAdminServer();
  
  try {
    await supabase
      .from('telegram_channels')
      .update({ linked_chat_id: discussionGroupId })
      .eq('tg_chat_id', channelId);
    
    logger.info({
      channel_id: channelId,
      discussion_group_id: discussionGroupId
    }, 'Channel linked to discussion group');
  } catch (error) {
    logger.error({ error, channel_id: channelId }, 'Failed to link channel to discussion group');
  }
}
