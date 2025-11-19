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
    
    // 2. Fetch messages (ALL available, not filtered by date)
    // ⚠️ Don't filter by date - imported history may have old dates
    // AI will prioritize recent messages anyway (last 50 messages in analyzeParticipantWithAI)
    
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('activity_events')
      .select('id, tg_user_id, message_id, event_type, created_at, meta')
      .eq('org_id', orgId)
      .eq('event_type', 'message')
      .order('created_at', { ascending: false })
      .limit(500); // Increased limit to capture more history
    
    if (messagesError) {
      throw new Error(`Failed to fetch messages: ${messagesError.message}`);
    }
    
    // Filter participant's messages
    const participantMessages = messages?.filter(m => m.tg_user_id === participant.tg_user_id) || [];
    
    // 3. Fetch participant's reactions (ALL available, not filtered by date)
    const { data: reactions, error: reactionsError } = await supabaseAdmin
      .from('activity_events')
      .select('id, tg_user_id, message_id, event_type, created_at, meta')
      .eq('org_id', orgId)
      .eq('tg_user_id', participant.tg_user_id)
      .eq('event_type', 'reaction')
      .order('created_at', { ascending: false });
    
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
    const stats = await calculateActivityStats(participantId, orgId, daysBack);
    
    // Initialize result
    const result: EnrichmentResult = {
      participant_id: participantId,
      success: false,
      messages_analyzed: participantMessages.length,
      reactions_analyzed: reactions?.length || 0,
      duration_ms: 0
    };
    
    // 6. AI Analysis (if requested and have messages)
    let aiAnalysis: AIEnrichmentResult | undefined;
    if (options.useAI && participantMessages.length > 0) {
      console.log(`[Enrichment] Preparing ${participantMessages.length} participant messages for AI analysis...`);
      
      // Prepare messages with context
      const messagesWithContext = await prepareMessagesWithContext(
        participantMessages,
        messages || [],
        participant.tg_user_id
      );
      
      console.log(`[Enrichment] Prepared ${messagesWithContext.length} messages with context (from ${participantMessages.length} raw messages)`);
      
      if (messagesWithContext.length === 0) {
        console.warn(`[Enrichment] ⚠️ No messages with text found! Sample message meta:`, participantMessages[0]?.meta);
      }
      
      aiAnalysis = await analyzeParticipantWithAI(
        messagesWithContext,
        participant.full_name || participant.username || `ID${participant.tg_user_id}`,
        orgId, // ⭐ For logging
        userId, // ⭐ Who triggered enrichment
        participantId, // ⭐ For metadata
        allKeywords
      );
      
      result.ai_analysis = aiAnalysis;
      result.cost_usd = aiAnalysis.cost_usd;
    } else if (options.useAI && participantMessages.length === 0) {
      console.warn(`[Enrichment] ⚠️ AI analysis requested but no participant messages found!`);
    }
    
    // 7. Behavioral Role Classification (rule-based)
    let roleClassification: RoleClassification | undefined;
    if (options.includeBehavior !== false) {
      roleClassification = classifyBehavioralRole(stats);
      result.behavioral_role = roleClassification;
    }
    
    // 8. Reaction Analysis (rule-based)
    let reactionPatterns: ReactionPatterns | undefined;
    if (options.includeReactions !== false && reactions && reactions.length > 0) {
      // Fetch original messages for reactions
      const reactionEventsWithMessages = await enrichReactionsWithMessages(reactions, orgId);
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
      
      // ⭐ Log AI analysis results for debugging
      console.log(`[Enrichment] AI Analysis results for participant ${participantId}:`, {
        interests_count: aiAnalysis.interests_keywords?.length || 0,
        topics_count: Object.keys(aiAnalysis.topics_discussed || {}).length,
        recent_asks_count: aiAnalysis.recent_asks?.length || 0,
        city: aiAnalysis.city_inferred,
        interests: aiAnalysis.interests_keywords,
        topics: aiAnalysis.topics_discussed,
        recent_asks: aiAnalysis.recent_asks
      });
    }
    
    if (roleClassification) {
      attributesUpdate.behavioral_role = roleClassification.role;
      attributesUpdate.role_confidence = roleClassification.confidence;
      
      console.log(`[Enrichment] Role classification: ${roleClassification.role} (${roleClassification.confidence})`);
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
    
    // ⭐ Log what will be saved
    console.log(`[Enrichment] Saving attributes update for participant ${participantId}:`, {
      ...attributesUpdate,
      interests_keywords_count: attributesUpdate.interests_keywords?.length || 0,
      topics_discussed_count: Object.keys(attributesUpdate.topics_discussed || {}).length,
      recent_asks_count: attributesUpdate.recent_asks?.length || 0
    });
    
    // 10. Save to database
    const currentAttributes = participant.custom_attributes || {};
    const mergedAttributes = mergeCustomAttributes(
      currentAttributes,
      attributesUpdate,
      { allowSystemFields: true } // Allow system fields for enrichment
    );
    
    console.log(`[Enrichment] Merged attributes (after merge):`, {
      interests_keywords: mergedAttributes.interests_keywords,
      topics_discussed: mergedAttributes.topics_discussed,
      recent_asks: mergedAttributes.recent_asks,
      behavioral_role: mergedAttributes.behavioral_role
    });
    
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
    
    console.log(`[Enrichment] ✅ Successfully saved enrichment data for participant ${participantId}`);
    
    result.success = true;
    result.duration_ms = Date.now() - startTime;
    
    return result;
  } catch (error) {
    console.error('[Enrichment] Error:', error);
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
 */
async function calculateActivityStats(
  participantId: string,
  orgId: string,
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
  
  if (!participant) {
    return {
      messages_count: 0,
      replies_sent: 0,
      replies_received: 0,
      unique_contacts: 0,
      reactions_given: 0,
      reactions_received: 0
    };
  }
  
  // Fetch all relevant activity
  const { data: activities } = await supabaseAdmin
    .from('activity_events')
    .select('id, tg_user_id, event_type, reply_to_user_id, message_id, created_at')
    .eq('org_id', orgId)
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
 */
async function prepareMessagesWithContext(
  participantMessages: any[],
  allMessages: any[],
  participantTgUserId: number
): Promise<Array<{
  id: string;
  text: string;
  author_name: string;
  created_at: string;
  is_participant: boolean;
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
    
    console.log(`[Enrichment] Fetched ${fullTextsMap.size} full texts from participant_messages (out of ${messageIds.length} message IDs)`);
  }
  
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
      if (skippedCount <= 3) {
        // Log first few skipped messages for debugging
        console.log(`[Enrichment] Skipping message ${msg.id} (message_id: ${msg.message_id}) - no text found. Meta structure:`, {
          hasMeta: !!msg.meta,
          metaKeys: msg.meta ? Object.keys(msg.meta) : [],
          metaType: typeof msg.meta,
          hasFullText: !!fullText,
          sampleMeta: JSON.stringify(msg.meta).slice(0, 200)
        });
      }
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
    
    result.push({
      id: msg.id.toString(),
      text: text.trim(),
      author_name: authorName,
      created_at: msg.created_at,
      is_participant: true
    });
  }
  
  if (skippedCount > 0) {
    console.warn(`[Enrichment] Skipped ${skippedCount} messages without text (out of ${participantMessages.length} total)`);
  }
  
  return result;
}

/**
 * Enrich reactions with original message data
 */
async function enrichReactionsWithMessages(
  reactions: any[],
  orgId: string
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
  
  if (messageIds.length === 0) {
    return reactions.map(r => ({
      message_id: r.message_id,
      tg_user_id: r.tg_user_id,
      emoji: r.meta?.emoji,
      created_at: r.created_at
    }));
  }
  
  // Fetch original messages
  const { data: originalMessages } = await supabaseAdmin
    .from('activity_events')
    .select('message_id, tg_user_id, meta')
    .eq('org_id', orgId)
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
  
  // Count ALL messages for this participant in this org (no date filter)
  const { count } = await supabaseAdmin
    .from('activity_events')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('tg_user_id', participant.tg_user_id)
    .eq('event_type', 'message');
  
  const messageCount = count || 0;
  const estimate = estimateAICost(Math.min(messageCount, 50)); // We only send top 50 to AI
  
  return {
    messageCount,
    ...estimate
  };
}

