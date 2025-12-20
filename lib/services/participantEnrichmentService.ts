/**
 * Participant Enrichment Service
 * 
 * Main orchestrator for participant profile enrichment.
 * Combines AI analysis (OpenAI) with rule-based analysis (roles, reactions).
 * 
 * IMPORTANT: AI analysis is MANUAL (triggered by org owner) to control costs.
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { analyzeParticipantWithAI, estimateAICost, type AIEnrichmentResult } from './enrichment/openaiService';
import { analyzeReactionPatterns, type ReactionPatterns } from './enrichment/reactionAnalyzer';
import { classifyBehavioralRole, type RoleClassification } from './enrichment/roleClassifier';
import { mergeCustomAttributes } from './enrichment/customFieldsManager';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('ParticipantEnrichment');
const supabaseAdmin = createAdminServer();

/**
 * Enrichment options
 */
interface EnrichmentOptions {
  useAI?: boolean;              // Use OpenAI API (costs money, manual only)
  includeBehavior?: boolean;    // Include role classification (rule-based, free)
  includeReactions?: boolean;   // Include reaction analysis (rule-based, free)
  daysBack?: number;            // How many days of history to analyze (default: 90)
}

/**
 * Enrichment result
 */
export interface EnrichmentResult {
  participant_id: string;
  success: boolean;
  
  // AI-extracted (if useAI=true)
  ai_analysis?: AIEnrichmentResult;
  
  // Rule-based (always included if data available)
  behavioral_role?: RoleClassification;
  reaction_patterns?: ReactionPatterns;
  
  // Meta
  messages_analyzed: number;
  reactions_analyzed: number;
  cost_usd?: number;
  duration_ms: number;
  error?: string;
}

/**
 * Main enrichment function
 * 
 * @param participantId - UUID of participant to enrich
 * @param orgId - UUID of organization (for permissions and context)
 * @param options - Enrichment options
 * @param userId - UUID of user who triggered enrichment (for logging, optional)
 * @returns Enrichment result
 */
export async function enrichParticipant(
  participantId: string,
  orgId: string,
  options: EnrichmentOptions = {},
  userId: string | null = null
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const daysBack = options.daysBack || 90;
  
  try {
    // 1. Fetch participant
    const { data: participant, error: participantError } = await supabaseAdmin
      .from('participants')
      .select('*')
      .eq('id', participantId)
      .eq('org_id', orgId)
      .single();
    
    if (participantError || !participant) {
      throw new Error('Participant not found');
    }
    
    // 1.5. Get accessible chat IDs for this organization
    // ⚠️ ВАЖНО: activity_events могут быть записаны с другим org_id, если группа привязана
    // к нескольким организациям. Поэтому фильтруем по tg_chat_id, а не org_id.
    const { data: orgGroups } = await supabaseAdmin
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId);
    
    const chatIds = (orgGroups || []).map(g => Number(g.tg_chat_id));
    
    if (chatIds.length === 0) {
      logger.warn({ org_id: orgId }, 'No telegram groups found for org');
    }
    
    // 2. Fetch messages (ALL available, not filtered by date)
    // ⚠️ Don't filter by date - imported history may have old dates
    // AI will prioritize recent messages anyway (last 50 messages in analyzeParticipantWithAI)
    
    let messages: any[] = [];
    if (chatIds.length > 0) {
      const { data: messagesData, error: messagesError } = await supabaseAdmin
        .from('activity_events')
        .select('id, tg_user_id, tg_chat_id, message_id, event_type, created_at, meta')
        .in('tg_chat_id', chatIds)
        .eq('event_type', 'message')
        .order('created_at', { ascending: false })
        .limit(500); // Increased limit to capture more history
      
      if (messagesError) {
        throw new Error(`Failed to fetch messages: ${messagesError.message}`);
      }
      messages = messagesData || [];
    }
    
    // Also fetch WhatsApp messages (stored with tg_chat_id = 0, participant_id in meta)
    const { data: whatsappMessages, error: whatsappError } = await supabaseAdmin
      .from('activity_events')
      .select('id, tg_user_id, tg_chat_id, message_id, event_type, created_at, meta')
      .eq('org_id', orgId)
      .eq('tg_chat_id', 0)  // WhatsApp marker
      .eq('event_type', 'message')
      .contains('meta', { participant_id: participantId })
      .order('created_at', { ascending: false })
      .limit(500);
    
    if (!whatsappError && whatsappMessages) {
      messages = [...messages, ...whatsappMessages];
    }
    
    // Filter participant's messages (for Telegram - by tg_user_id, for WhatsApp - already filtered by participant_id)
    const participantMessages = messages.filter(m => 
      m.tg_user_id === participant.tg_user_id || 
      (m.tg_chat_id === 0 && m.meta?.participant_id === participantId)
    );
    
    // 3. Fetch participant's reactions (ALL available, not filtered by date)
    let reactions: any[] = [];
    if (chatIds.length > 0) {
      const { data: reactionsData, error: reactionsError } = await supabaseAdmin
        .from('activity_events')
        .select('id, tg_user_id, tg_chat_id, message_id, event_type, created_at, meta')
        .in('tg_chat_id', chatIds)
        .eq('tg_user_id', participant.tg_user_id)
        .eq('event_type', 'reaction')
        .order('created_at', { ascending: false });
      
      if (!reactionsError) {
        reactions = reactionsData || [];
      }
    }
    
    // 4. Fetch group keywords (for AI context)
    const { data: groups } = await supabaseAdmin
      .from('participant_groups')
      .select(`
        tg_group_id,
        telegram_groups!inner (
          keywords
        )
      `)
      .eq('participant_id', participantId);
    
    const allKeywords = groups
      ?.flatMap(g => (g.telegram_groups as any).keywords || [])
      .filter((v, i, a) => a.indexOf(v) === i) || []; // unique
    
    // 5. Calculate activity stats (for role classification)
    const stats = await calculateActivityStats(participantId, chatIds, daysBack);
    
    // Initialize result
    const result: EnrichmentResult = {
      participant_id: participantId,
      success: false,
      messages_analyzed: participantMessages.length,
      reactions_analyzed: reactions.length,
      duration_ms: 0
    };
    
    // 6. AI Analysis (if requested and have messages)
    let aiAnalysis: AIEnrichmentResult | undefined;
    if (options.useAI && participantMessages.length > 0) {
      // Prepare messages with context (including reply_to and thread context)
      const messagesWithContext = await prepareMessagesWithContext(
        participantMessages,
        messages,
        participant.tg_user_id,
        chatIds  // ⭐ Pass chatIds for fetching reply texts
      );
      
      if (messagesWithContext.length === 0) {
        // This is expected for participants who only send media (stickers, images, voice, etc.)
        logger.debug({ participant_id: participantId }, 'No messages with text found for participant (media-only user)');
      }
      
      // Prepare reacted messages as interest signals
      const reactedMessages = await prepareReactedMessagesForAI(reactions, chatIds);
      
      aiAnalysis = await analyzeParticipantWithAI(
        messagesWithContext,
        participant.full_name || participant.username || `ID${participant.tg_user_id}`,
        orgId, // ⭐ For logging
        userId, // ⭐ Who triggered enrichment
        participantId, // ⭐ For metadata
        allKeywords,
        reactedMessages // ⭐ NEW: Pass reacted messages
      );
      
      result.ai_analysis = aiAnalysis;
      result.cost_usd = aiAnalysis.cost_usd;
    } else if (options.useAI && participantMessages.length === 0) {
      // New participant or silent member - not an error
      logger.debug({ participant_id: participantId }, 'AI analysis requested but no participant messages found');
    }
    
    // 7. Behavioral Role Classification (rule-based)
    let roleClassification: RoleClassification | undefined;
    if (options.includeBehavior !== false) {
      roleClassification = classifyBehavioralRole(stats);
      result.behavioral_role = roleClassification;
    }
    
    // 8. Reaction Analysis (rule-based)
    let reactionPatterns: ReactionPatterns | undefined;
    if (options.includeReactions !== false && reactions.length > 0) {
      // Fetch original messages for reactions
      const reactionEventsWithMessages = await enrichReactionsWithMessages(reactions, chatIds);
      reactionPatterns = analyzeReactionPatterns(reactionEventsWithMessages, participantMessages.length);
      result.reaction_patterns = reactionPatterns;
    }
    
    // 9. Build custom_attributes update
    const attributesUpdate: Record<string, any> = {};
    
    if (aiAnalysis) {
      attributesUpdate.interests_keywords = aiAnalysis.interests_keywords;
      attributesUpdate.topics_discussed = aiAnalysis.topics_discussed;
      attributesUpdate.recent_asks = aiAnalysis.recent_asks;
      if (aiAnalysis.city_inferred) {
        attributesUpdate.city_inferred = aiAnalysis.city_inferred;
        attributesUpdate.city_confidence = aiAnalysis.city_confidence;
      }
      attributesUpdate.ai_analysis_cost = aiAnalysis.cost_usd;
      attributesUpdate.ai_analysis_tokens = aiAnalysis.tokens_used;
    }
    
    if (roleClassification) {
      attributesUpdate.behavioral_role = roleClassification.role;
      attributesUpdate.role_confidence = roleClassification.confidence;
    }
    
    if (reactionPatterns) {
      attributesUpdate.reaction_patterns = {
        total: reactionPatterns.total_reactions,
        favorite_emojis: reactionPatterns.favorite_emojis,
        reacts_to_topics: reactionPatterns.reacts_to_topics,
        sentiment: reactionPatterns.sentiment
      };
    }
    
    // Meta
    attributesUpdate.last_enriched_at = new Date().toISOString();
    attributesUpdate.enrichment_version = '1.0';
    attributesUpdate.enrichment_source = options.useAI ? 'ai' : 'rule-based';
    
    // 10. Save to database
    const currentAttributes = participant.custom_attributes || {};
    const mergedAttributes = mergeCustomAttributes(
      currentAttributes,
      attributesUpdate,
      { allowSystemFields: true } // Allow system fields for enrichment
    );
    
    const { error: updateError } = await supabaseAdmin
      .from('participants')
      .update({
        custom_attributes: mergedAttributes,
        updated_at: new Date().toISOString()
      })
      .eq('id', participantId);
    
    if (updateError) {
      throw new Error(`Failed to update participant: ${updateError.message}`);
    }
    
    result.success = true;
    result.duration_ms = Date.now() - startTime;
    
    return result;
  } catch (error) {
    logger.error({ 
      participant_id: participantId,
      org_id: orgId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Enrichment error');
    return {
      participant_id: participantId,
      success: false,
      messages_analyzed: 0,
      reactions_analyzed: 0,
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Calculate activity stats for role classification
 * 
 * @param participantId - UUID of participant
 * @param chatIds - Array of tg_chat_id for this organization's groups
 * @param daysBack - How many days of history to analyze
 */
async function calculateActivityStats(
  participantId: string,
  chatIds: number[],
  daysBack: number
): Promise<{
  messages_count: number;
  replies_sent: number;
  replies_received: number;
  unique_contacts: number;
  reactions_given: number;
  reactions_received: number;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  // Get participant's tg_user_id
  const { data: participant } = await supabaseAdmin
    .from('participants')
    .select('tg_user_id')
    .eq('id', participantId)
    .single();
  
  if (!participant || chatIds.length === 0) {
    return {
      messages_count: 0,
      replies_sent: 0,
      replies_received: 0,
      unique_contacts: 0,
      reactions_given: 0,
      reactions_received: 0
    };
  }
  
  // Fetch all relevant activity (filter by tg_chat_id, not org_id)
  const { data: activities } = await supabaseAdmin
    .from('activity_events')
    .select('id, tg_user_id, tg_chat_id, event_type, reply_to_user_id, message_id, created_at')
    .in('tg_chat_id', chatIds)
    .gte('created_at', cutoffDate.toISOString());
  
  if (!activities) {
    return {
      messages_count: 0,
      replies_sent: 0,
      replies_received: 0,
      unique_contacts: 0,
      reactions_given: 0,
      reactions_received: 0
    };
  }
  
  const messages = activities.filter(a => a.event_type === 'message');
  const reactions = activities.filter(a => a.event_type === 'reaction');
  
  const participantMessages = messages.filter(m => m.tg_user_id === participant.tg_user_id);
  const replies_sent = participantMessages.filter(m => m.reply_to_user_id).length;
  const replies_received = messages.filter(m => m.reply_to_user_id === participant.tg_user_id).length;
  
  const unique_contacts = new Set(
    participantMessages
      .filter(m => m.reply_to_user_id)
      .map(m => m.reply_to_user_id)
  ).size;
  
  const reactions_given = reactions.filter(r => r.tg_user_id === participant.tg_user_id).length;
  
  // Count reactions received (need to match message_id)
  const participantMessageIds = new Set(participantMessages.map(m => m.message_id));
  const reactions_received = reactions.filter(r => 
    r.message_id && participantMessageIds.has(r.message_id)
  ).length;
  
  return {
    messages_count: participantMessages.length,
    replies_sent,
    replies_received,
    unique_contacts,
    reactions_given,
    reactions_received
  };
}

/**
 * Prepare messages with context for AI analysis
 * 
 * ⚠️ IMPORTANT: Full text is stored in participant_messages table, not in activity_events.meta
 * We need to fetch full texts from participant_messages, fallback to text_preview from meta
 * 
 * Now includes:
 * - reply_to context (text of message being replied to)
 * - thread context (nearby messages in the same discussion)
 */
async function prepareMessagesWithContext(
  participantMessages: any[],
  allMessages: any[],
  participantTgUserId: number,
  chatIds: number[] = []
): Promise<Array<{
  id: string;
  text: string;
  author_name: string;
  created_at: string;
  is_participant: boolean;
  reply_to_text?: string;
  reply_to_author?: string;
  thread_context?: string[];
}>> {
  if (participantMessages.length === 0) {
    return [];
  }
  
  // ⭐ Fetch full message texts from participant_messages table
  const messageIds = participantMessages
    .map(m => m.message_id)
    .filter(Boolean);
  
  let fullTextsMap = new Map<number, string>();
  
  if (messageIds.length > 0) {
    const { data: fullMessages } = await supabaseAdmin
      .from('participant_messages')
      .select('message_id, message_text')
      .eq('tg_user_id', participantTgUserId)
      .in('message_id', messageIds);
    
    if (fullMessages) {
      fullMessages.forEach((m: any) => {
        if (m.message_text) {
          fullTextsMap.set(m.message_id, m.message_text);
        }
      });
    }
  }
  
  // ⭐ NEW: Fetch reply_to message texts
  // Get all reply_to_message_id from participant's messages
  const replyToMessageIds = participantMessages
    .map(m => m.meta?.reply_to_message_id)
    .filter(Boolean);
  
  let replyTextsMap = new Map<number, { text: string; author: string }>();
  
  if (replyToMessageIds.length > 0 && chatIds.length > 0) {
    // Fetch texts of messages being replied to
    const { data: replyMessages } = await supabaseAdmin
      .from('participant_messages')
      .select('message_id, message_text, tg_user_id')
      .in('tg_chat_id', chatIds)
      .in('message_id', replyToMessageIds);
    
    if (replyMessages) {
      // Also try to get author names from activity_events
      const replyUserIds = Array.from(new Set(replyMessages.map((m: any) => m.tg_user_id)));
      
      // Fetch participant names for reply authors
      const { data: replyAuthors } = await supabaseAdmin
        .from('participants')
        .select('tg_user_id, full_name, username')
        .in('tg_user_id', replyUserIds);
      
      const authorNamesMap = new Map<number, string>();
      if (replyAuthors) {
        replyAuthors.forEach((a: any) => {
          authorNamesMap.set(a.tg_user_id, a.full_name || a.username || `ID${a.tg_user_id}`);
        });
      }
      
      replyMessages.forEach((m: any) => {
        if (m.message_text) {
          replyTextsMap.set(m.message_id, {
            text: m.message_text,
            author: authorNamesMap.get(m.tg_user_id) || 'Unknown'
          });
        }
      });
    }
  }
  
  // ⭐ NEW: Build thread context map (nearby messages in time)
  // Sort all messages by created_at for thread context
  const sortedAllMessages = [...allMessages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  const messageIndexMap = new Map<string, number>();
  sortedAllMessages.forEach((m, idx) => {
    messageIndexMap.set(m.id, idx);
  });
  
  const result = [];
  let skippedCount = 0;
  
  for (const msg of participantMessages) {
    // ⚠️ Try multiple paths for text extraction:
    // 1. Full text from participant_messages (preferred)
    // 2. text_preview from meta (fallback)
    // 3. Other possible locations
    const fullText = msg.message_id ? fullTextsMap.get(msg.message_id) : null;
    const text = 
      fullText ||                                                    // ✅ Full text from participant_messages
      msg.meta?.message?.text_preview ||                            // Preview format (first 500 chars)
      msg.meta?.message?.text ||                                    // Standard format (if exists)
      msg.meta?.text ||                                             // Direct text
      msg.meta?.text_entities?.[0]?.text ||                         // Text entities format
      (typeof msg.meta === 'string' ? msg.meta : '');              // Fallback: meta as string
    
    if (!text || text.trim().length === 0) {
      skippedCount++;
      continue;
    }
    
    // Extract author name from various possible locations
    const authorName = 
      msg.meta?.user?.name ||
      msg.meta?.message?.from?.first_name ||
      msg.meta?.message?.from_name ||
      msg.meta?.from_name ||
      msg.meta?.author_name ||
      'Unknown';
    
    // ⭐ NEW: Get reply_to context
    let reply_to_text: string | undefined;
    let reply_to_author: string | undefined;
    
    const replyToMsgId = msg.meta?.reply_to_message_id;
    if (replyToMsgId && replyTextsMap.has(replyToMsgId)) {
      const replyData = replyTextsMap.get(replyToMsgId)!;
      reply_to_text = replyData.text;
      reply_to_author = replyData.author;
    }
    
    // ⭐ NEW: Get thread context (1-2 messages before in the same chat)
    let thread_context: string[] | undefined;
    const msgIndex = messageIndexMap.get(msg.id);
    if (msgIndex !== undefined && msgIndex > 0) {
      const contextMessages: string[] = [];
      // Look back up to 2 messages in the same chat
      for (let i = msgIndex - 1; i >= Math.max(0, msgIndex - 2); i--) {
        const prevMsg = sortedAllMessages[i];
        if (prevMsg.tg_chat_id === msg.tg_chat_id && prevMsg.tg_user_id !== participantTgUserId) {
          const prevText = 
            prevMsg.meta?.message?.text_preview ||
            prevMsg.meta?.message?.text ||
            prevMsg.meta?.text || '';
          if (prevText && prevText.trim().length > 0) {
            contextMessages.unshift(prevText.trim());
          }
        }
      }
      if (contextMessages.length > 0) {
        thread_context = contextMessages;
      }
    }
    
    result.push({
      id: msg.id.toString(),
      text: text.trim(),
      author_name: authorName,
      created_at: msg.created_at,
      is_participant: true,
      reply_to_text,
      reply_to_author,
      thread_context
    });
  }
  
  return result;
}

/**
 * Prepare reacted messages as interest signals for AI analysis
 * 
 * Returns texts of messages that the participant reacted to,
 * which serves as a signal of their interests.
 * 
 * @param reactions - Array of reaction events
 * @param chatIds - Array of tg_chat_id for this organization's groups
 */
async function prepareReactedMessagesForAI(
  reactions: any[],
  chatIds: number[]
): Promise<Array<{
  text: string;
  emoji: string;
  author?: string;
}>> {
  if (reactions.length === 0 || chatIds.length === 0) {
    return [];
  }
  
  const messageIds = reactions
    .map(r => r.message_id)
    .filter(Boolean);
  
  if (messageIds.length === 0) {
    return [];
  }
  
  // Fetch texts of reacted messages from participant_messages
  const { data: reactedMessages } = await supabaseAdmin
    .from('participant_messages')
    .select('message_id, message_text, tg_user_id')
    .in('tg_chat_id', chatIds)
    .in('message_id', messageIds);
  
  if (!reactedMessages || reactedMessages.length === 0) {
    // Fallback: try to get from activity_events meta
    const { data: activityMessages } = await supabaseAdmin
      .from('activity_events')
      .select('message_id, tg_user_id, meta')
      .in('tg_chat_id', chatIds)
      .eq('event_type', 'message')
      .in('message_id', messageIds);
    
    if (!activityMessages) {
      return [];
    }
    
    const messageTextsMap = new Map<number, { text: string; author_id: number }>();
    activityMessages.forEach((m: any) => {
      const text = m.meta?.message?.text_preview || m.meta?.message?.text || m.meta?.text || '';
      if (text) {
        messageTextsMap.set(m.message_id, { text, author_id: m.tg_user_id });
      }
    });
    
    // Get author names
    const authorIds = Array.from(new Set(Array.from(messageTextsMap.values()).map(m => m.author_id)));
    const { data: authors } = await supabaseAdmin
      .from('participants')
      .select('tg_user_id, full_name, username')
      .in('tg_user_id', authorIds);
    
    const authorNamesMap = new Map<number, string>();
    if (authors) {
      authors.forEach((a: any) => {
        authorNamesMap.set(a.tg_user_id, a.full_name || a.username || `ID${a.tg_user_id}`);
      });
    }
    
    // Build result from reactions
    const result: Array<{ text: string; emoji: string; author?: string }> = [];
    const seenMessageIds = new Set<number>();
    
    for (const reaction of reactions) {
      if (!reaction.message_id || seenMessageIds.has(reaction.message_id)) continue;
      
      const messageData = messageTextsMap.get(reaction.message_id);
      if (messageData && messageData.text) {
        seenMessageIds.add(reaction.message_id);
        result.push({
          text: messageData.text.slice(0, 300), // Limit text length
          emoji: reaction.meta?.emoji || '👍',
          author: authorNamesMap.get(messageData.author_id)
        });
      }
    }
    
    return result.slice(0, 20); // Limit to 20 reacted messages
  }
  
  // Get author names
  const authorIds = Array.from(new Set(reactedMessages.map((m: any) => m.tg_user_id)));
  const { data: authors } = await supabaseAdmin
    .from('participants')
    .select('tg_user_id, full_name, username')
    .in('tg_user_id', authorIds);
  
  const authorNamesMap = new Map<number, string>();
  if (authors) {
    authors.forEach((a: any) => {
      authorNamesMap.set(a.tg_user_id, a.full_name || a.username || `ID${a.tg_user_id}`);
    });
  }
  
  // Build map of message_id -> text
  const messageTextsMap = new Map<number, { text: string; author_id: number }>();
  reactedMessages.forEach((m: any) => {
    if (m.message_text) {
      messageTextsMap.set(m.message_id, { text: m.message_text, author_id: m.tg_user_id });
    }
  });
  
  // Build result from reactions
  const result: Array<{ text: string; emoji: string; author?: string }> = [];
  const seenMessageIds = new Set<number>();
  
  for (const reaction of reactions) {
    if (!reaction.message_id || seenMessageIds.has(reaction.message_id)) continue;
    
    const messageData = messageTextsMap.get(reaction.message_id);
    if (messageData && messageData.text) {
      seenMessageIds.add(reaction.message_id);
      result.push({
        text: messageData.text.slice(0, 300), // Limit text length
        emoji: reaction.meta?.emoji || '👍',
        author: authorNamesMap.get(messageData.author_id)
      });
    }
  }
  
  return result.slice(0, 20); // Limit to 20 reacted messages
}

/**
 * Enrich reactions with original message data
 * 
 * @param reactions - Array of reaction events
 * @param chatIds - Array of tg_chat_id for this organization's groups
 */
async function enrichReactionsWithMessages(
  reactions: any[],
  chatIds: number[]
): Promise<Array<{
  message_id: number;
  tg_user_id: number;
  emoji?: string;
  created_at: string;
  original_message?: {
    text: string;
    author_id: number;
    author_name?: string;
  };
}>> {
  const messageIds = reactions
    .map(r => r.message_id)
    .filter(Boolean);
  
  if (messageIds.length === 0 || chatIds.length === 0) {
    return reactions.map(r => ({
      message_id: r.message_id,
      tg_user_id: r.tg_user_id,
      emoji: r.meta?.emoji,
      created_at: r.created_at
    }));
  }
  
  // Fetch original messages (filter by tg_chat_id, not org_id)
  const { data: originalMessages } = await supabaseAdmin
    .from('activity_events')
    .select('message_id, tg_user_id, tg_chat_id, meta')
    .in('tg_chat_id', chatIds)
    .eq('event_type', 'message')
    .in('message_id', messageIds);
  
  const messagesMap = new Map(
    originalMessages?.map(m => [m.message_id, m]) || []
  );
  
  return reactions.map(r => ({
    message_id: r.message_id,
    tg_user_id: r.tg_user_id,
    emoji: r.meta?.emoji,
    created_at: r.created_at,
    original_message: messagesMap.has(r.message_id) ? {
      text: messagesMap.get(r.message_id)?.meta?.message?.text || '',
      author_id: messagesMap.get(r.message_id)?.tg_user_id,
      author_name: messagesMap.get(r.message_id)?.meta?.message?.from?.first_name
    } : undefined
  }));
}

/**
 * Estimate cost before running AI enrichment
 */
export async function estimateEnrichmentCost(
  participantId: string,
  orgId: string,
  daysBack: number = 90
): Promise<{
  messageCount: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  estimatedCostRub: number;
}> {
  // ⚠️ Don't filter by date - use all available messages
  // Imported history may have old dates, but we still want to analyze them
  // AI will prioritize recent messages anyway (last 50 messages)
  
  const { data: participant } = await supabaseAdmin
    .from('participants')
    .select('tg_user_id')
    .eq('id', participantId)
    .single();
  
  if (!participant) {
    return { messageCount: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedCostRub: 0 };
  }
  
  // Get accessible chat IDs for this organization
  const { data: orgGroups } = await supabaseAdmin
    .from('org_telegram_groups')
    .select('tg_chat_id')
    .eq('org_id', orgId);
  
  const chatIds = (orgGroups || []).map(g => Number(g.tg_chat_id));
  
  if (chatIds.length === 0) {
    logger.warn({ org_id: orgId }, 'No telegram groups found for org when estimating cost');
    return { messageCount: 0, estimatedTokens: 0, estimatedCostUsd: 0, estimatedCostRub: 0 };
  }
  
  // Count ALL messages for this participant in org's groups (filter by tg_chat_id, not org_id)
  const { count } = await supabaseAdmin
    .from('activity_events')
    .select('id', { count: 'exact', head: true })
    .in('tg_chat_id', chatIds)
    .eq('tg_user_id', participant.tg_user_id)
    .eq('event_type', 'message');
  
  const messageCount = count || 0;
  const estimate = estimateAICost(Math.min(messageCount, 50)); // We only send top 50 to AI
  
  return {
    messageCount,
    ...estimate
  };
}

