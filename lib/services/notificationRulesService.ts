/**
 * Notification Rules Service
 * 
 * Main business logic for processing notification rules:
 * - Load active rules
 * - Fetch messages for analysis
 * - Run AI analysis (if enabled)
 * - Check for triggers
 * - Send notifications
 * - Handle deduplication
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import { sendSystemNotification } from './telegramNotificationService';
import { analyzeNegativeContent, analyzeUnansweredQuestions } from './aiNotificationAnalysis';
import { getOrgBillingStatus } from './billingService';
import crypto from 'crypto';

const logger = createServiceLogger('NotificationRules');

const supabaseAdmin = createAdminServer();

interface NotificationRule {
  id: string;
  org_id: string;
  name: string;
  rule_type: 'negative_discussion' | 'unanswered_question' | 'group_inactive' | 'churning_participant' | 'inactive_newcomer' | 'critical_event';
  config: {
    groups?: string[] | null;
    severity_threshold?: 'low' | 'medium' | 'high';
    sensitivity?: number;        // 1-5 sensitivity level (overrides severity_threshold)
    custom_prompt?: string;      // Optional custom instructions for AI
    check_interval_minutes?: number;
    timeout_hours?: number;
    work_hours_start?: string;
    work_hours_end?: string;
    work_days?: number[];
    timezone?: string;
  };
  use_ai: boolean;
  notify_owner: boolean;
  notify_admins: boolean;
  is_enabled: boolean;
  last_check_at: string | null;
}

interface Message {
  id: string;
  text: string;
  author_name: string;
  author_id: string;
  created_at: string;
  tg_chat_id: string;
  tg_message_id?: number; // Telegram message ID for direct link
  message_thread_id?: number; // Telegram topic/thread ID
  has_reply?: boolean;
}

interface RuleCheckResult {
  triggered: boolean;
  skipped?: boolean; // True if rule was skipped due to time interval
  triggerContext?: Record<string, unknown>;
  aiCostUsd?: number;
}

/**
 * Parse Telegram user ID from various RPC result formats.
 * PostgREST/Supabase can return BIGINT as: bigint, number, string, 
 * wrapped object (typeof=object but String() gives numeric), or array.
 */
function parseTelegramId(rpcResult: unknown): number | null {
  if (rpcResult === null || rpcResult === undefined) return null;

  if (typeof rpcResult === 'bigint') {
    return Number(rpcResult);
  }
  if (typeof rpcResult === 'number') {
    return rpcResult;
  }
  if (typeof rpcResult === 'string') {
    const parsed = parseInt(rpcResult, 10);
    return isNaN(parsed) ? null : parsed;
  }
  if (Array.isArray(rpcResult) && rpcResult.length > 0) {
    const firstItem = rpcResult[0];
    if (typeof firstItem === 'object' && firstItem !== null && firstItem.get_user_telegram_id) {
      return Number(firstItem.get_user_telegram_id);
    }
    // Array of scalars
    return parseTelegramId(firstItem);
  }
  // Object type (PostgREST wrapped scalar) — String() gives the numeric value
  // Number(object) returns NaN, so we parse from string representation
  const strValue = String(rpcResult);
  const parsed = parseInt(strValue, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Generate deduplication hash from trigger context
 */
function generateDedupHash(ruleId: string, context: Record<string, unknown>): string {
  // Create hash from key identifying info
  const key = JSON.stringify({
    rule_id: ruleId,
    group_id: context.group_id,
    type: context.type,
    // For questions, include author
    author_id: context.question_author_id,
  });
  return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Check if notification is duplicate (already sent recently)
 */
async function isDuplicate(ruleId: string, dedupHash: string, hoursBack: number = 6): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_notification_duplicate', {
      p_rule_id: ruleId,
      p_dedup_hash: dedupHash,
      p_hours: hoursBack,
    });
    
    if (error) {
      logger.error({ error: error.message, rule_id: ruleId, dedup_hash: dedupHash }, 'RPC error checking duplicate');
      // On error, assume IS duplicate to prevent spam
      return true;
    }
    
    const isDup = data === true;
    if (isDup) {
      logger.debug({ rule_id: ruleId, hours_back: hoursBack }, 'Duplicate found, skipping');
    }
    return isDup;
  } catch (error) {
    logger.error({ error, rule_id: ruleId }, 'Error checking duplicate');
    // On error, assume IS duplicate to prevent spam
    return true;
  }
}

/**
 * Log notification to database
 */
async function logNotification(params: {
  ruleId: string;
  orgId: string;
  ruleType: string;
  triggerContext: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  dedupHash: string;
  sentToUserIds?: string[];
  aiCostUsd?: number;
  errorMessage?: string;
}): Promise<{ success: boolean }> {
  try {
    // Use upsert with ON CONFLICT DO NOTHING to prevent duplicates
    const { error } = await supabaseAdmin.from('notification_logs').upsert(
      {
        rule_id: params.ruleId,
        org_id: params.orgId,
        rule_type: params.ruleType,
        trigger_context: params.triggerContext,
        notification_status: params.status,
        dedup_hash: params.dedupHash,
        sent_to_user_ids: params.sentToUserIds || [],
        sent_via: params.status === 'sent' ? ['telegram'] : [],
        ai_cost_usd: params.aiCostUsd || null,
        error_message: params.errorMessage || null,
        processed_at: new Date().toISOString(),
      },
      {
        onConflict: 'rule_id,dedup_hash',
        ignoreDuplicates: true,
      }
    );
    
    if (error) {
      // Ignore unique constraint violations (race condition duplicates)
      if (error.code === '23505') {
        logger.debug({ 
          rule_id: params.ruleId, 
          dedup_hash: params.dedupHash 
        }, 'Duplicate notification prevented by constraint');
        return { success: true };
      }
      logger.error({ 
        error: error.message, 
        rule_id: params.ruleId,
        status: params.status,
        dedup_hash: params.dedupHash
      }, '❌ Failed to save notification to database');
      return { success: false };
    }
    
    logger.debug({ 
      rule_id: params.ruleId, 
      status: params.status 
    }, 'Notification logged to database');
    return { success: true };
  } catch (error) {
    logger.error({ error, rule_id: params.ruleId }, 'Error logging notification');
    return { success: false };
  }
}

/**
 * Update rule's last_check_at and increment trigger_count if triggered
 */
async function updateRuleStatus(ruleId: string, triggered: boolean): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {
      last_check_at: new Date().toISOString(),
    };
    
    if (triggered) {
      updateData.last_triggered_at = new Date().toISOString();
      // Increment trigger_count
      await supabaseAdmin.rpc('increment_notification_trigger_count', { p_rule_id: ruleId });
    }
    
    await supabaseAdmin
      .from('notification_rules')
      .update(updateData)
      .eq('id', ruleId);
  } catch (error) {
    logger.error({ error, rule_id: ruleId }, 'Error updating rule status');
  }
}

interface UserData {
  email: string | null;
  tg_user_id: number | null;
  full_name: string | null;
}

/**
 * Get recipients for a rule (owner and/or admins)
 */
async function getRecipients(rule: NotificationRule): Promise<Array<{ tgUserId: number; name: string }>> {
  const recipients: Array<{ tgUserId: number; name: string }> = [];
  
  try {
    // Get owner if notify_owner is true
    if (rule.notify_owner) {
      // First get owner's user_id from memberships
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('memberships')
        .select('user_id')
        .eq('org_id', rule.org_id)
        .eq('role', 'owner')
        .single();
      
      logger.debug({ 
        rule_id: rule.id, 
        org_id: rule.org_id,
        membership_found: !!membership,
        user_id: membership?.user_id,
        error: membershipError?.message 
      }, 'Looking for owner membership');
      
      if (membership?.user_id) {
        // Use RPC function to get telegram ID (works with auth.users)
        const { data: rpcResult, error: rpcError } = await supabaseAdmin
          .rpc('get_user_telegram_id', { p_user_id: membership.user_id });
        
        // RPC can return different formats depending on Supabase version and PostgreSQL client
        // Handle: bigint, number, string, object (PostgREST wrapped scalar), or array of objects
        const tgUserId = parseTelegramId(rpcResult);
        
        logger.info({
          rule_id: rule.id,
          user_id: membership.user_id,
          rpc_result_type: typeof rpcResult,
          rpc_raw_result: rpcResult !== null ? String(rpcResult) : null,
          tg_user_id_parsed: tgUserId,
          rpc_error: rpcError?.message
        }, 'RPC get_user_telegram_id result for owner');
        
        if (tgUserId && !isNaN(tgUserId)) {
          recipients.push({
            tgUserId: tgUserId,
            name: 'Owner',
          });
        } else if (!rpcError) {
          logger.error({ 
            rule_id: rule.id, 
            user_id: membership.user_id, 
            rpc_result: rpcResult !== null ? String(rpcResult) : null,
            rpc_result_type: typeof rpcResult
          }, 'Owner has no valid tg_user_id - notification delivery will fail');
        }
      }
    }
    
    // Get admins if notify_admins is true
    if (rule.notify_admins) {
      const { data: adminMemberships, error: adminsError } = await supabaseAdmin
        .from('memberships')
        .select('user_id')
        .eq('org_id', rule.org_id)
        .eq('role', 'admin');
      
      if (adminMemberships) {
        for (const adminMembership of adminMemberships) {
          const { data: rpcResult } = await supabaseAdmin
            .rpc('get_user_telegram_id', { p_user_id: adminMembership.user_id });
          
          // Parse RPC result (handle bigint, number, string, object, array formats)
          const tgUserId = parseTelegramId(rpcResult);
          
          if (tgUserId && !isNaN(tgUserId) && !recipients.find(r => r.tgUserId === tgUserId)) {
            recipients.push({
              tgUserId: tgUserId,
              name: 'Admin',
            });
          }
        }
      }
    }
    
    logger.debug({ 
      rule_id: rule.id, 
      recipients_count: recipients.length,
      recipients: recipients.map(r => ({ tgUserId: r.tgUserId, name: r.name }))
    }, 'Recipients found');
  } catch (error) {
    logger.error({ error, rule_id: rule.id }, 'Error getting recipients');
  }
  
  return recipients;
}

/**
 * Get telegram groups for organization
 */
async function getOrgGroups(orgId: string, specificChatIds?: string[] | null): Promise<string[]> {
  try {
    if (specificChatIds && specificChatIds.length > 0) {
      return specificChatIds;
    }
    
    // Get all groups for org
    const { data } = await supabaseAdmin
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId);
    
    return (data || []).map(g => String(g.tg_chat_id));
  } catch (error) {
    logger.error({ error, org_id: orgId }, 'Error getting org groups');
    return [];
  }
}

/**
 * Get group title by chat_id
 */
async function getGroupTitle(chatId: string): Promise<string> {
  try {
    const chatIdNum = parseInt(chatId, 10);
    const { data } = await supabaseAdmin
      .from('telegram_groups')
      .select('title')
      .eq('tg_chat_id', chatIdNum)
      .single();
    return data?.title || `Группа ${chatId}`;
  } catch {
    return `Группа ${chatId}`;
  }
}

/**
 * Get MAX group title by max_chat_id
 */
async function getMaxGroupTitle(chatId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('max_groups')
      .select('title')
      .eq('max_chat_id', chatId)
      .single();
    return data?.title || `MAX группа ${chatId}`;
  } catch {
    return `MAX группа ${chatId}`;
  }
}

/**
 * Get org MAX group chat IDs
 */
async function getOrgMaxGroups(orgId: string, specificChatIds?: string[] | null): Promise<string[]> {
  try {
    if (specificChatIds && specificChatIds.length > 0) {
      return specificChatIds.filter(id => id.startsWith('max:')).map(id => id.slice(4));
    }
    const { data } = await supabaseAdmin
      .from('org_max_groups')
      .select('max_chat_id')
      .eq('org_id', orgId);
    return (data || []).map((g: { max_chat_id: number }) => String(g.max_chat_id));
  } catch (error) {
    logger.error({ error, org_id: orgId }, 'Error getting MAX org groups');
    return [];
  }
}

/**
 * Get recent messages from a MAX group
 */
async function getRecentMaxMessages(
  maxChatId: string,
  sinceMinutes: number = 60,
  limit: number = 100
): Promise<Message[]> {
  try {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('activity_events')
      .select('id, max_user_id, max_chat_id, org_id, event_type, created_at, meta')
      .eq('max_chat_id', maxChatId)
      .eq('event_type', 'message')
      .eq('messenger_type', 'max')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !data || data.length === 0) return [];

    // Resolve participant names
    const maxUserIds = Array.from(new Set(data.map((m: any) => String(m.max_user_id))));
    const { data: participants } = await supabaseAdmin
      .from('participants')
      .select('max_user_id, full_name, max_username')
      .in('max_user_id', maxUserIds);

    const nameMap = new Map<string, string>();
    (participants || []).forEach((p: any) => {
      nameMap.set(String(p.max_user_id), p.full_name || p.max_username || 'Участник');
    });

    return data.map((m: any) => ({
      id: m.id,
      text: m.meta?.text || '',
      author_name: nameMap.get(String(m.max_user_id)) || 'Участник',
      author_id: String(m.max_user_id),
      created_at: m.created_at,
      tg_chat_id: `max:${m.max_chat_id}`,
    }));
  } catch (error) {
    logger.error({ error, max_chat_id: maxChatId }, 'Error getting MAX messages');
    return [];
  }
}

/**
 * Get recent messages from a group
 */
async function getRecentMessages(
  chatId: string,
  sinceMinutes: number = 60,
  limit: number = 100
): Promise<Message[]> {
  try {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
    
    // Convert chatId to number for BIGINT comparison
    const chatIdNum = parseInt(chatId, 10);
    
    logger.debug({ chat_id: chatId, since_minutes: sinceMinutes }, 'Querying messages');
    
    // Use participant_messages for full text content (better for AI analysis)
    const { data, error } = await supabaseAdmin
      .from('participant_messages')
      .select(`
        id,
        tg_user_id,
        tg_chat_id,
        message_id,
        message_text,
        sent_at,
        participant_id,
        message_thread_id
      `)
      .eq('tg_chat_id', chatIdNum)
      .gte('sent_at', since)
      .order('sent_at', { ascending: true })
      .limit(limit);
    
    if (error) {
      // Downgrade to warn for transient network errors (502, fetch failed, etc.)
      const isTransient = error.message?.includes('fetch failed') || error.message?.includes('502');
      if (isTransient) {
        logger.warn({ error: error.message, chat_id: chatId, transient: true }, 'Query error from participant_messages (transient)');
      } else {
        logger.error({ error: error.message, chat_id: chatId }, 'Query error from participant_messages');
      }
      
      // Fallback to activity_events if participant_messages fails
      const { data: activityData, error: activityError } = await supabaseAdmin
        .from('activity_events')
        .select('id, tg_user_id, tg_chat_id, message_id, created_at')
        .eq('tg_chat_id', chatIdNum)
        .eq('event_type', 'message')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(limit);
      
      if (activityError) {
        const isTransient = activityError.message?.includes('fetch failed') || activityError.message?.includes('502');
        if (isTransient) {
          logger.warn({ error: activityError.message, chat_id: chatId, transient: true }, 'Fallback query error (transient)');
        } else {
          logger.error({ error: activityError.message, chat_id: chatId }, 'Fallback query error');
        }
        return [];
      }
      
      if (!activityData || activityData.length === 0) {
        logger.debug({ chat_id: chatId }, 'No messages found');
        return [];
      }
      
      logger.debug({ chat_id: chatId, count: activityData.length }, 'Messages from activity_events');
      
      // Batch-fetch texts from participant_messages by message_id
      const messageIds = activityData.map(m => m.message_id).filter(Boolean);
      const textsMap = new Map<number, string>();
      if (messageIds.length > 0) {
        const { data: pmTexts } = await supabaseAdmin
          .from('participant_messages')
          .select('message_id, message_text')
          .eq('tg_chat_id', chatIdNum)
          .in('message_id', messageIds);
        (pmTexts || []).forEach((pm: any) => {
          if (pm.message_text) textsMap.set(pm.message_id, pm.message_text);
        });
      }
      
      // Get participant names
      const userIds = Array.from(new Set(activityData.map(m => m.tg_user_id)));
      const { data: participants } = await supabaseAdmin
        .from('participants')
        .select('tg_user_id, full_name, first_name, last_name, username')
        .in('tg_user_id', userIds);
      
      const nameMap = new Map<string, string>();
      (participants || []).forEach(p => {
        const nameFromParts = [p.first_name, p.last_name].filter(Boolean).join(' ');
        const fullNameClean = p.full_name && !p.full_name.includes('@') ? p.full_name : '';
        const displayName = fullNameClean || p.username || nameFromParts || 'Участник';
        nameMap.set(String(p.tg_user_id), displayName);
      });
      
      return activityData.map(m => ({
        id: m.id,
        text: (m.message_id ? textsMap.get(m.message_id) : '') || '',
        author_name: nameMap.get(String(m.tg_user_id)) || 'Участник',
        author_id: String(m.tg_user_id),
        created_at: m.created_at,
        tg_chat_id: String(m.tg_chat_id),
        tg_message_id: m.message_id ? Number(m.message_id) : undefined,
      }));
    }
    
    if (!data || data.length === 0) {
      logger.debug({ chat_id: chatId }, 'No messages found');
      return [];
    }
    
    logger.debug({ chat_id: chatId, count: data.length }, 'Messages found');
    
    // Get participant names
    const userIds = Array.from(new Set(data.map(m => m.tg_user_id)));
    const { data: participants } = await supabaseAdmin
      .from('participants')
      .select('tg_user_id, full_name, first_name, last_name, username')
      .in('tg_user_id', userIds);
    
    const nameMap = new Map<string, string>();
    (participants || []).forEach(p => {
      // Prefer Telegram-style name; skip full_name if it looks like an email
      const nameFromParts = [p.first_name, p.last_name].filter(Boolean).join(' ');
      const fullNameClean = p.full_name && !p.full_name.includes('@') ? p.full_name : '';
      const displayName = fullNameClean || p.username || nameFromParts || 'Участник';
      nameMap.set(String(p.tg_user_id), displayName);
    });
    
    return data.map(m => ({
      id: m.id,
      text: m.message_text || '',
      author_name: nameMap.get(String(m.tg_user_id)) || 'Участник',
      author_id: String(m.tg_user_id),
      created_at: m.sent_at,
      tg_chat_id: String(m.tg_chat_id),
      tg_message_id: m.message_id ? Number(m.message_id) : undefined,
      message_thread_id: m.message_thread_id ? Number(m.message_thread_id) : undefined,
    }));
  } catch (error) {
    logger.error({ error, chat_id: chatId }, 'Error getting messages');
    return [];
  }
}

/**
 * Check if currently within work hours
 */
function isWithinWorkHours(
  workStart: string | null,
  workEnd: string | null,
  workDays: number[] | null,
  timezone: string = 'Europe/Moscow'
): boolean {
  if (!workStart || !workEnd) return true; // No restrictions
  
  try {
    const now = new Date();
    // Simple timezone handling
    const tzOffset = timezone === 'Europe/Moscow' ? 3 : 0;
    const localHour = (now.getUTCHours() + tzOffset) % 24;
    const localDay = now.getUTCDay();
    
    // Check work day
    if (workDays && workDays.length > 0 && !workDays.includes(localDay)) {
      return false;
    }
    
    // Parse work hours
    const [startH, startM] = workStart.split(':').map(Number);
    const [endH, endM] = workEnd.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const currentMinutes = localHour * 60 + now.getUTCMinutes();
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true;
  }
}

/**
 * Generate Telegram message link
 * Format: https://t.me/c/{chat_id_without_-100}/{message_id}
 * For topics: https://t.me/c/{chat_id_without_-100}/{message_id}?thread={thread_id}
 */
function getTelegramMessageLink(chatId: string, messageId?: number, threadId?: number): string | null {
  try {
    // Convert chat ID: remove -100 prefix for private link format
    let cleanChatId = chatId;
    if (chatId.startsWith('-100')) {
      cleanChatId = chatId.slice(4); // Remove -100
    } else if (chatId.startsWith('-')) {
      cleanChatId = chatId.slice(1); // Remove just -
    }
    
    if (messageId) {
      let link = `https://t.me/c/${cleanChatId}/${messageId}`;
      if (threadId) {
        link += `?thread=${threadId}`;
      }
      return link;
    }
    
    // Without messageId, return link to the group itself
    return `https://t.me/c/${cleanChatId}`;
  } catch {
    return null;
  }
}

/**
 * Format notification message for Telegram
 */
function formatNotificationMessage(
  rule: NotificationRule,
  context: Record<string, unknown>,
  groupTitle: string,
  groupChatId?: string
): string {
  // Формируем ссылку на группу (если есть invite link в будущем)
  // Пока просто показываем название группы как текст
  const groupDisplay = groupTitle || 'группа';
  
  // Generate link to message if available (with topic thread support)
  const messageLink = groupChatId && context.last_message_id 
    ? getTelegramMessageLink(groupChatId, context.last_message_id as number, context.thread_id as number | undefined)
    : null;
  
  const linkText = messageLink ? `\n\n[Открыть в Telegram →](${messageLink})` : '';
  
  switch (rule.rule_type) {
    case 'negative_discussion':
      return `🔴 *Негатив в группе «${groupDisplay}»*

${context.summary || 'Обнаружена негативная дискуссия'}

*Серьёзность:* ${context.severity === 'high' ? '🔴 Высокая' : context.severity === 'medium' ? '🟡 Средняя' : '🟢 Низкая'}
*Сообщений:* ${context.message_count || 0}${linkText}

_${rule.name}_`;

    case 'unanswered_question':
      return `❓ *Неотвеченный вопрос в «${groupDisplay}»*

"${(context.question_text as string || '').slice(0, 200)}"
— _${context.question_author || 'Участник'}_, ${context.time_ago || 'недавно'}

*Без ответа:* ${context.hours_without_answer || '?'} ч.${linkText}

_${rule.name}_`;

    case 'group_inactive': {
      // Generate link to the group even without message_id
      const groupLink = groupChatId ? getTelegramMessageLink(groupChatId, undefined) : null;
      const inactivityLinkText = groupLink ? `\n\n[Открыть группу в Telegram →](${groupLink})` : '';
      
      return `💤 *Неактивность в «${groupDisplay}»*

В группе нет сообщений уже *${context.inactive_hours || '?'} часов*.

Последнее сообщение: ${context.last_message_at || 'неизвестно'}${inactivityLinkText}

_${rule.name}_`;
    }

    default:
      return `🔔 *Уведомление от Orbo*\n\n${JSON.stringify(context)}`;
  }
}

/**
 * Process a single rule
 */
async function processRule(rule: NotificationRule): Promise<RuleCheckResult> {
  logger.debug({ 
    rule_id: rule.id, 
    rule_name: rule.name, 
    rule_type: rule.rule_type, 
    org_id: rule.org_id,
    use_ai: rule.use_ai
  }, '🔄 Processing notification rule');
  
  // Check if enough time has passed since last check (respect check_interval_minutes)
  const intervalMinutes = (rule.config.check_interval_minutes as number) || 60;
  if (rule.last_check_at) {
    const lastCheck = new Date(rule.last_check_at);
    const minutesSinceLastCheck = Math.floor((Date.now() - lastCheck.getTime()) / (1000 * 60));
    
    if (minutesSinceLastCheck < intervalMinutes) {
      logger.debug({ 
        rule_id: rule.id, 
        rule_name: rule.name,
        minutes_since_last: minutesSinceLastCheck,
        interval_minutes: intervalMinutes 
      }, '⏭️ Skipping rule - not enough time since last check');
      return { triggered: false, skipped: true };
    }
  }
  
  const groups = await getOrgGroups(rule.org_id, rule.config.groups);
  if (groups.length === 0) {
    logger.debug({ rule_id: rule.id, rule_name: rule.name, org_id: rule.org_id }, 'No groups to check for this rule');
    return { triggered: false };
  }
  
  logger.debug({ rule_id: rule.id, rule_name: rule.name, groups_count: groups.length }, 'Groups to check');
  
  let triggered = false;
  let totalAiCost = 0;
  
  for (const chatId of groups) {
    const groupTitle = await getGroupTitle(chatId);
    
    switch (rule.rule_type) {
      case 'negative_discussion': {
        if (!rule.use_ai) {
          continue; // Skip if AI not enabled
        }
        
        const intervalMinutes = (rule.config.check_interval_minutes as number) || 60;
        
        // Calculate time since last trigger to avoid re-analyzing same messages
        let effectiveIntervalMinutes = intervalMinutes;
        if (rule.last_check_at) {
          const lastCheck = new Date(rule.last_check_at);
          const minutesSinceLastCheck = Math.floor((Date.now() - lastCheck.getTime()) / (1000 * 60));
          // Only look at messages since last check (with small buffer)
          effectiveIntervalMinutes = Math.min(intervalMinutes, minutesSinceLastCheck + 5);
        }
        
        const allMessages = await getRecentMessages(chatId, effectiveIntervalMinutes, 50);
        
        logger.debug({ 
          rule_id: rule.id, 
          chat_id: chatId, 
          group_title: groupTitle,
          interval_minutes: effectiveIntervalMinutes,
          original_interval: intervalMinutes,
          messages_count: allMessages.length 
        }, 'Messages found for analysis');
        
        // Minimum 1 message for testing (increase to 3 for production)
        if (allMessages.length < 1) {
          logger.debug({ rule_id: rule.id, chat_id: chatId, count: allMessages.length }, '⏭️ No messages found');
          continue;
        }
        
        // Group messages by topic (message_thread_id) for separate analysis
        const messagesByTopic = new Map<number | undefined, Message[]>();
        for (const msg of allMessages) {
          const topicId = msg.message_thread_id;
          if (!messagesByTopic.has(topicId)) {
            messagesByTopic.set(topicId, []);
          }
          messagesByTopic.get(topicId)!.push(msg);
        }
        
        const severityThreshold = (rule.config.severity_threshold as 'low' | 'medium' | 'high') || 'medium';
        const severityOrder: Record<string, number> = { low: 1, medium: 2, high: 3 };
        const threshold = severityOrder[severityThreshold];
        
        // Analyze each topic group separately, collect results
        const topicResults: Array<{
          topicId: number | undefined;
          analysis: any;
          messages: Message[];
          lastMessageId: number | undefined;
        }> = [];
        
        for (const [topicId, messages] of messagesByTopic) {
          if (messages.length < 1) continue;
          
          const analysis = await analyzeNegativeContent(
            messages,
            rule.org_id,
            rule.id,
            severityThreshold,
            rule.config.sensitivity ?? null,
            rule.config.custom_prompt ?? null
          );
          
          totalAiCost += analysis.cost_usd;
          
          const detected = severityOrder[analysis.severity];
          
          if (analysis.has_negative && detected >= threshold) {
            const lastMessage = messages[messages.length - 1];
            topicResults.push({
              topicId,
              analysis,
              messages,
              lastMessageId: lastMessage?.tg_message_id,
            });
          }
        }
        
        // Send ONE aggregated notification per group (not per topic)
        if (topicResults.length > 0) {
          // Pick the highest severity and combine summaries
          const highestSeverity = topicResults.reduce((max, r) => 
            severityOrder[r.analysis.severity] > severityOrder[max] ? r.analysis.severity : max, 
            topicResults[0].analysis.severity
          );
          
          const totalMessages = topicResults.reduce((sum, r) => sum + r.messages.length, 0);
          
          // Combine summaries from all topics
          let combinedSummary: string;
          if (topicResults.length === 1) {
            const topicLabel = topicResults[0].topicId ? ` (тема #${topicResults[0].topicId})` : '';
            combinedSummary = topicResults[0].analysis.summary + (topicLabel ? `\n_${topicLabel}_` : '');
          } else {
            combinedSummary = topicResults.map(r => {
              const label = r.topicId ? `Тема #${r.topicId}` : 'Основной чат';
              return `• ${label}: ${r.analysis.summary}`;
            }).join('\n');
          }
          
          // Use the first result's last_message_id for the main link
          const primaryResult = topicResults[0];
          
          const triggerContext = {
            type: 'negative_discussion',
            group_id: chatId,
            group_title: groupTitle,
            severity: highestSeverity,
            summary: combinedSummary,
            message_count: totalMessages,
            sample_messages: primaryResult.analysis.sample_messages,
            last_message_id: primaryResult.lastMessageId,
            thread_id: primaryResult.topicId,
            topics_affected: topicResults.length,
          };
          
          const dedupHash = generateDedupHash(rule.id, triggerContext);
          
          // Check for duplicate (6 hour window to prevent spam)
          if (!await isDuplicate(rule.id, dedupHash, 6)) {
            // Send notifications
            const recipients = await getRecipients(rule);
            const message = formatNotificationMessage(rule, triggerContext, groupTitle, chatId);
            
            let sentCount = 0;
            for (const recipient of recipients) {
              const result = await sendSystemNotification(recipient.tgUserId, message);
              if (result.success) sentCount++;
            }
            
            const finalStatus = sentCount > 0 ? 'sent' : 'failed';
            
            // Log notification
            const logResult = await logNotification({
              ruleId: rule.id,
              orgId: rule.org_id,
              ruleType: rule.rule_type,
              triggerContext,
              status: finalStatus,
              dedupHash,
              sentToUserIds: recipients.map(r => String(r.tgUserId)),
              aiCostUsd: topicResults.reduce((sum, r) => sum + r.analysis.cost_usd, 0),
            });
            
            triggered = true;
            logger.info({ 
              rule_name: rule.name,
              chat: groupTitle,
              topics_affected: topicResults.length, 
              severity: highestSeverity,
              total_messages: totalMessages,
              telegram_sent: sentCount,
              saved_to_db: logResult.success,
            }, '🔔 Negative discussion notification (aggregated)');
          } else {
            logger.debug({ rule_id: rule.id, chat_id: chatId, topics: topicResults.length }, 'Duplicate notification, skipping');
          }
        }
        break;
      }
      
      case 'unanswered_question': {
        // Check work hours
        if (!isWithinWorkHours(
          rule.config.work_hours_start || null,
          rule.config.work_hours_end || null,
          rule.config.work_days || null,
          rule.config.timezone || 'Europe/Moscow'
        )) {
          logger.debug({ rule_name: rule.name, chat: groupTitle }, '❓ Skipping unanswered_question: outside work hours');
          continue;
        }
        
        if (!rule.use_ai) {
          logger.warn({ rule_name: rule.name, chat: groupTitle }, '❓ Skipping unanswered_question: use_ai is false — enable AI for this rule');
          continue;
        }
        
        const timeoutHours = rule.config.timeout_hours || 2;
        // Fetch up to 150 messages so answers that follow a question are included
        const allMessages = await getRecentMessages(chatId, timeoutHours * 60 + 30, 150);
        
        logger.debug({ rule_name: rule.name, chat: groupTitle, message_count: allMessages.length, timeout_hours: timeoutHours, window_minutes: timeoutHours * 60 + 30 }, '❓ Unanswered question check: fetched messages');
        
        if (allMessages.length < 1) {
          logger.debug({ rule_name: rule.name, chat: groupTitle }, '❓ Skipping unanswered_question: no messages in window');
          continue;
        }
        
        // Group messages by topic (message_thread_id) for separate analysis
        const msgsByTopic = new Map<number | undefined, Message[]>();
        for (const msg of allMessages) {
          const topicId = msg.message_thread_id;
          if (!msgsByTopic.has(topicId)) {
            msgsByTopic.set(topicId, []);
          }
          msgsByTopic.get(topicId)!.push(msg);
        }
        
        for (const [topicId, messages] of msgsByTopic) {
          if (messages.length < 1) continue;
          
          const analysis = await analyzeUnansweredQuestions(
            messages,
            rule.org_id,
            rule.id,
            timeoutHours,
            rule.config.sensitivity ?? null,
            rule.config.custom_prompt ?? null
          );
          
          totalAiCost += analysis.cost_usd;
          
          const topicLabel = topicId ? ` (тема #${topicId})` : '';
          
          logger.debug({ 
            rule_name: rule.name, 
            chat: groupTitle + topicLabel, 
            topic_id: topicId,
            questions_found: analysis.questions.length,
            cost_usd: analysis.cost_usd,
          }, '❓ AI analysis result for unanswered questions');
          logger.debug({
            rule_name: rule.name,
            questions: analysis.questions.map((q: any) => ({ text: q.text?.slice(0, 60), author: q.author, answered: q.answered }))
          }, '❓ Questions detail');
          
          // Send notification for each unanswered question
          for (const question of analysis.questions) {
            const hoursAgo = Math.floor(
              (Date.now() - new Date(question.timestamp).getTime()) / (1000 * 60 * 60)
            );
            
            if (hoursAgo < timeoutHours) {
              logger.debug({ rule_name: rule.name, chat: groupTitle, topic_id: topicId, hours_ago: hoursAgo, timeout: timeoutHours, question: question.text?.slice(0, 60) }, '❓ Question not yet timed out, skipping');
              continue;
            }
            
            const triggerContext = {
              type: 'unanswered_question',
              group_id: chatId,
              group_title: groupTitle + topicLabel,
              question_text: question.text,
              question_author: question.author,
              question_author_id: question.author_id,
              question_time: question.timestamp,
              hours_without_answer: hoursAgo,
              time_ago: `${hoursAgo} ч. назад`,
              last_message_id: question.tg_message_id, // For direct Telegram link
              thread_id: topicId, // Topic thread ID for link
            };
            
            const dedupHash = generateDedupHash(rule.id, triggerContext);
            
            // Check for duplicate (6 hour window)
            if (await isDuplicate(rule.id, dedupHash, 6)) {
              continue;
            }
            
            const recipients = await getRecipients(rule);
            const message = formatNotificationMessage(rule, triggerContext, groupTitle + topicLabel, chatId);
            
            let sentCount = 0;
            for (const recipient of recipients) {
              const result = await sendSystemNotification(recipient.tgUserId, message);
              if (result.success) sentCount++;
            }
            
            const logResult = await logNotification({
              ruleId: rule.id,
              orgId: rule.org_id,
              ruleType: rule.rule_type,
              triggerContext,
              status: sentCount > 0 ? 'sent' : 'failed',
              dedupHash,
              sentToUserIds: recipients.map(r => String(r.tgUserId)),
              aiCostUsd: analysis.cost_usd / Math.max(analysis.questions.length, 1),
            });
            
            triggered = true;
            logger.debug({
              rule_name: rule.name,
              chat: groupTitle,
              topic_id: topicId,
              author: question.author,
              hours: hoursAgo,
              telegram_sent: sentCount,
              saved_to_db: logResult.success
            }, '❓ Unanswered question notification');
          }
        }
        break;
      }
      
      case 'group_inactive': {
        const timeoutHours = rule.config.timeout_hours || 24;
        // Window in hours after threshold crossing when notification can be sent
        // Using 2 hours to account for cron job intervals (typically 15-60 min)
        const notificationWindowHours = 2;
        
        // Get last message time
        const { data: lastMessage } = await supabaseAdmin
          .from('activity_events')
          .select('created_at')
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (!lastMessage) continue;
        
        const lastMessageTime = new Date(lastMessage.created_at);
        const lastMessageTimestamp = lastMessage.created_at; // ISO string for exact comparison
        const hoursInactive = (Date.now() - lastMessageTime.getTime()) / (1000 * 60 * 60);
        
        // ===== SIMPLE AND RELIABLE LOGIC =====
        // Send notification ONLY if:
        // 1. Inactivity >= X hours (threshold crossed)
        // 2. Inactivity < X + window hours (threshold was JUST crossed, not long ago)
        //
        // This ensures notification is sent ONCE per inactivity period:
        // - If hours_inactive < X: threshold not yet crossed → skip
        // - If X <= hours_inactive < X+window: threshold just crossed → SEND
        // - If hours_inactive >= X+window: threshold crossed long ago → skip (already notified)
        
        if (hoursInactive < timeoutHours) {
          // Not inactive long enough yet
          continue;
        }
        
        if (hoursInactive >= timeoutHours + notificationWindowHours) {
          // Threshold was crossed more than 2 hours ago - we should have already sent notification
          // Skip to prevent spam
          logger.debug({ 
            rule_id: rule.id, 
            chat_id: chatId,
            group_title: groupTitle,
            hours_inactive: Math.floor(hoursInactive),
            timeout_hours: timeoutHours,
            window_hours: notificationWindowHours,
          }, '⏭️ Skipping - inactivity threshold crossed too long ago (outside notification window)');
          continue;
        }
        
        // We're in the notification window: X <= hoursInactive < X + window
        // This is the sweet spot - threshold was just crossed
        logger.info({ 
          rule_id: rule.id, 
          chat_id: chatId,
          group_title: groupTitle,
          hours_inactive: Math.floor(hoursInactive),
          timeout_hours: timeoutHours,
        }, '🔔 In notification window - threshold just crossed');
        
        const groupLink = getTelegramMessageLink(chatId);
        const triggerContext = {
          type: 'group_inactive',
          group_id: chatId,
          group_title: groupTitle,
          last_message_at: lastMessageTime.toLocaleString('ru'),
          inactive_hours: Math.floor(hoursInactive),
          last_message_timestamp: lastMessageTimestamp,
          group_link: groupLink,
        };
        
        // Additional safety: dedup hash based on the DAY of the last message
        // This prevents multiple notifications on the same day even if cron runs multiple times
        const lastMessageDay = lastMessageTime.toISOString().split('T')[0];
        const inactivityDedupHash = `inactivity_${rule.id}_${chatId}_${lastMessageDay}`;
        
        if (await isDuplicate(rule.id, inactivityDedupHash, 48)) { // 48 hours lookback
          logger.debug({ 
            rule_id: rule.id, 
            chat_id: chatId,
            dedup_hash: inactivityDedupHash
          }, '⏭️ Skipping - duplicate found in last 48 hours');
          continue;
        }
        
        const recipients = await getRecipients(rule);
        const message = formatNotificationMessage(rule, triggerContext, groupTitle, chatId);
        
        let sentCount = 0;
        for (const recipient of recipients) {
          const result = await sendSystemNotification(recipient.tgUserId, message);
          if (!result.success) {
            logger.warn({
              tg_user_id: recipient.tgUserId,
              error: result.error
            }, 'Failed to send Telegram notification');
          }
          if (result.success) sentCount++;
        }
        
        const logResult = await logNotification({
          ruleId: rule.id,
          orgId: rule.org_id,
          ruleType: rule.rule_type,
          triggerContext,
          status: sentCount > 0 ? 'sent' : 'failed',
          dedupHash: inactivityDedupHash,
          sentToUserIds: recipients.map(r => String(r.tgUserId)),
        });
        
        triggered = true;
        logger.info({
          rule_name: rule.name,
          chat: groupTitle,
          inactive_hours: Math.floor(hoursInactive),
          telegram_sent: sentCount,
          saved_to_db: logResult.success
        }, '💤 Group inactivity notification SENT');
        break;
      }
    }
  }
  
  return { triggered, aiCostUsd: totalAiCost };
}

/**
 * Main entry point: Process all active notification rules
 */
export async function processAllNotificationRules(): Promise<{
  processed: number;
  triggered: number;
  totalAiCost: number;
}> {
  // Get ALL rules to verify which are enabled/disabled
  const { data: allRules, error: allError } = await supabaseAdmin
    .from('notification_rules')
    .select('id, name, is_enabled, rule_type');
  
  if (allError) {
    logger.error({ error: allError.message }, 'Error fetching all rules');
  } else {
    // Log which rules are paused for debugging
    const pausedRules = allRules?.filter(r => !r.is_enabled) || [];
    if (pausedRules.length > 0) {
      logger.debug({ 
        paused_rules: pausedRules.map(r => ({ id: r.id, name: r.name, type: r.rule_type }))
      }, 'Skipping paused rules');
    }
  }
  
  // Get only enabled rules for processing
  const { data: rules, error } = await supabaseAdmin
    .from('notification_rules')
    .select('*')
    .eq('is_enabled', true);
  
  if (error) {
    logger.error({ error: error.message }, 'Error fetching enabled rules');
    return { processed: 0, triggered: 0, totalAiCost: 0 };
  }
  
  if (!rules || rules.length === 0) {
    logger.debug({}, 'No enabled notification rules to process');
    return { processed: 0, triggered: 0, totalAiCost: 0 };
  }
  
  logger.debug({
    count: rules.length,
    enabled_rules: rules.map(r => ({ id: r.id, name: r.name, type: r.rule_type, org_id: r.org_id }))
  }, 'Processing enabled notification rules');

  // Pre-check billing for orgs that have AI-requiring rules (one call per unique org)
  const AI_RULE_TYPES = new Set(['negative_discussion', 'unanswered_question', 'churning_participant', 'inactive_newcomer', 'critical_event']);
  const orgIdsNeedingAI: string[] = Array.from(new Set<string>(rules.filter(r => AI_RULE_TYPES.has(r.rule_type)).map(r => String(r.org_id))));
  const orgAiEnabled = new Map<string, boolean>();
  await Promise.all(
    orgIdsNeedingAI.map(async (orgId: string) => {
      try {
        const billing = await getOrgBillingStatus(orgId);
        orgAiEnabled.set(orgId, billing.aiEnabled || billing.isTrial);
      } catch {
        orgAiEnabled.set(orgId, false);
      }
    })
  );

  let triggeredCount = 0;
  let totalAiCost = 0;

  for (const rule of rules) {
    if (AI_RULE_TYPES.has(rule.rule_type) && !orgAiEnabled.get(rule.org_id)) {
      logger.debug({ rule_id: rule.id, rule_name: rule.name, org_id: rule.org_id }, 'Skipping AI rule: org does not have AI feature enabled');
      continue;
    }
    try {
      const result = await processRule(rule as NotificationRule);
      
      if (result.triggered) {
        triggeredCount++;
      }
      
      if (result.aiCostUsd) {
        totalAiCost += result.aiCostUsd;
      }
      
      // Only update status if rule was actually processed (not skipped due to time)
      if (!result.skipped) {
        await updateRuleStatus(rule.id, result.triggered);
      }
    } catch (error) {
      logger.error({ error, rule_id: rule.id }, 'Error processing rule');
    }
  }
  
  logger.debug({
    processed: rules.length,
    triggered: triggeredCount,
    total_ai_cost_usd: totalAiCost
  }, 'Notification rules processing complete');
  
  return {
    processed: rules.length,
    triggered: triggeredCount,
    totalAiCost,
  };
}

