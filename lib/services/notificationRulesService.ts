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

import { createClient } from '@supabase/supabase-js';
import { createServiceLogger } from '@/lib/logger';
import { sendSystemNotification } from './telegramNotificationService';
import { analyzeNegativeContent, analyzeUnansweredQuestions } from './aiNotificationAnalysis';
import crypto from 'crypto';

const logger = createServiceLogger('NotificationRules');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false }
  }
);

interface NotificationRule {
  id: string;
  org_id: string;
  name: string;
  rule_type: 'negative_discussion' | 'unanswered_question' | 'group_inactive';
  config: {
    groups?: string[] | null;
    severity_threshold?: 'low' | 'medium' | 'high';
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
  has_reply?: boolean;
}

interface RuleCheckResult {
  triggered: boolean;
  triggerContext?: Record<string, unknown>;
  aiCostUsd?: number;
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
      
      // Debug level for routine lookups
      logger.debug({ 
        rule_id: rule.id, 
        org_id: rule.org_id,
        error: membershipError?.message 
      }, 'Looking for owner membership');
      
      if (membership?.user_id) {
        // Use RPC function to get telegram ID (works with auth.users)
        const { data: tgUserId, error: rpcError } = await supabaseAdmin
          .rpc('get_user_telegram_id', { p_user_id: membership.user_id });
        
        if (tgUserId) {
          recipients.push({
            tgUserId: tgUserId,
            name: 'Owner',
          });
        } else if (!rpcError) {
          logger.debug({ rule_id: rule.id, user_id: membership.user_id }, 'Owner has no tg_user_id');
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
          const { data: tgUserId } = await supabaseAdmin
            .rpc('get_user_telegram_id', { p_user_id: adminMembership.user_id });
          
          if (tgUserId && !recipients.find(r => r.tgUserId === tgUserId)) {
            recipients.push({
              tgUserId: tgUserId,
              name: 'Admin',
            });
          }
        }
      }
    }
    
    logger.debug({ rule_id: rule.id, recipients_count: recipients.length }, 'Recipients found');
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
        participant_id
      `)
      .eq('tg_chat_id', chatIdNum)
      .gte('sent_at', since)
      .order('sent_at', { ascending: true })
      .limit(limit);
    
    if (error) {
      logger.error({ error: error.message, chat_id: chatId }, 'Query error from participant_messages');
      
      // Fallback to activity_events if participant_messages fails
      const { data: activityData, error: activityError } = await supabaseAdmin
        .from('activity_events')
        .select(`
          id,
          tg_user_id,
          tg_chat_id,
          event_type,
          created_at,
          meta
        `)
        .eq('tg_chat_id', chatIdNum)
        .eq('event_type', 'message')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(limit);
      
      if (activityError) {
        logger.error({ error: activityError.message, chat_id: chatId }, 'Fallback query error');
        return [];
      }
      
      if (!activityData || activityData.length === 0) {
        logger.debug({ chat_id: chatId }, 'No messages found');
        return [];
      }
      
      logger.debug({ chat_id: chatId, count: activityData.length }, 'Messages from activity_events');
      
      // Get participant names
      const userIds = Array.from(new Set(activityData.map(m => m.tg_user_id)));
      const { data: participants } = await supabaseAdmin
        .from('participants')
        .select('tg_user_id, full_name, username')
        .in('tg_user_id', userIds);
      
      const nameMap = new Map<string, string>();
      (participants || []).forEach(p => {
        nameMap.set(String(p.tg_user_id), p.full_name || p.username || 'Участник');
      });
      
      return activityData.map(m => {
        // Extract text from meta - it's stored in message.text_preview
        const text = m.meta?.message?.text_preview || m.meta?.text || '';
        // Extract message_id from meta
        const messageId = m.meta?.message?.message_id || m.meta?.message_id;
        return {
          id: m.id,
          text,
          author_name: nameMap.get(String(m.tg_user_id)) || 'Участник',
          author_id: String(m.tg_user_id),
          created_at: m.created_at,
          tg_chat_id: String(m.tg_chat_id),
          tg_message_id: messageId ? Number(messageId) : undefined,
        };
      });
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
      .select('tg_user_id, full_name, username')
      .in('tg_user_id', userIds);
    
    const nameMap = new Map<string, string>();
    (participants || []).forEach(p => {
      nameMap.set(String(p.tg_user_id), p.full_name || p.username || 'Участник');
    });
    
    return data.map(m => ({
      id: m.id,
      text: m.message_text || '',
      author_name: nameMap.get(String(m.tg_user_id)) || 'Участник',
      author_id: String(m.tg_user_id),
      created_at: m.sent_at,
      tg_chat_id: String(m.tg_chat_id),
      tg_message_id: m.message_id ? Number(m.message_id) : undefined,
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
 */
function getTelegramMessageLink(chatId: string, messageId?: number): string | null {
  if (!messageId) return null;
  
  try {
    // Convert chat ID: remove -100 prefix for private link format
    let cleanChatId = chatId;
    if (chatId.startsWith('-100')) {
      cleanChatId = chatId.slice(4); // Remove -100
    } else if (chatId.startsWith('-')) {
      cleanChatId = chatId.slice(1); // Remove just -
    }
    
    return `https://t.me/c/${cleanChatId}/${messageId}`;
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
  
  // Generate link to message if available
  const messageLink = groupChatId && context.last_message_id 
    ? getTelegramMessageLink(groupChatId, context.last_message_id as number)
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

    case 'group_inactive':
      return `💤 *Неактивность в «${groupDisplay}»*

В группе нет сообщений уже *${context.inactive_hours || '?'} часов*.

Последнее сообщение: ${context.last_message_at || 'неизвестно'}

_${rule.name}_`;

    default:
      return `🔔 *Уведомление от Orbo*\n\n${JSON.stringify(context)}`;
  }
}

/**
 * Process a single rule
 */
async function processRule(rule: NotificationRule): Promise<RuleCheckResult> {
  // Check if enough time has passed since last check (respect check_interval_minutes)
  const intervalMinutes = (rule.config.check_interval_minutes as number) || 60;
  if (rule.last_check_at) {
    const lastCheck = new Date(rule.last_check_at);
    const minutesSinceLastCheck = Math.floor((Date.now() - lastCheck.getTime()) / (1000 * 60));
    
    if (minutesSinceLastCheck < intervalMinutes) {
      logger.debug({ 
        rule_id: rule.id, 
        minutes_since_last: minutesSinceLastCheck,
        interval_minutes: intervalMinutes 
      }, '⏭️ Skipping rule - not enough time since last check');
      return { triggered: false };
    }
  }
  
  const groups = await getOrgGroups(rule.org_id, rule.config.groups);
  if (groups.length === 0) {
    logger.debug({ rule_id: rule.id }, 'No groups to check');
    return { triggered: false };
  }
  
  logger.debug({ rule_id: rule.id, groups_count: groups.length }, 'Groups to check');
  
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
        
        const messages = await getRecentMessages(chatId, effectiveIntervalMinutes, 50);
        
        logger.debug({ 
          rule_id: rule.id, 
          chat_id: chatId, 
          group_title: groupTitle,
          interval_minutes: effectiveIntervalMinutes,
          original_interval: intervalMinutes,
          messages_count: messages.length 
        }, 'Messages found for analysis');
        
        // Minimum 1 message for testing (increase to 3 for production)
        if (messages.length < 1) {
          logger.debug({ rule_id: rule.id, chat_id: chatId, count: messages.length }, '⏭️ No messages found');
          continue;
        }
        
        const severityThreshold = (rule.config.severity_threshold as 'low' | 'medium' | 'high') || 'medium';
        const analysis = await analyzeNegativeContent(
          messages,
          rule.org_id,
          rule.id,
          severityThreshold
        );
        
        totalAiCost += analysis.cost_usd;
        
        // Check if severity meets threshold
        const severityOrder: Record<string, number> = { low: 1, medium: 2, high: 3 };
        const threshold = severityOrder[severityThreshold];
        const detected = severityOrder[analysis.severity];
        
        if (analysis.has_negative && detected >= threshold) {
          // Get last message ID for direct Telegram link
          const lastMessage = messages[messages.length - 1];
          const lastMessageId = lastMessage?.tg_message_id;
          
          const triggerContext = {
            type: 'negative_discussion',
            group_id: chatId,
            group_title: groupTitle,
            severity: analysis.severity,
            summary: analysis.summary,
            message_count: messages.length,
            sample_messages: analysis.sample_messages,
            last_message_id: lastMessageId, // For direct Telegram link
          };
          
          const dedupHash = generateDedupHash(rule.id, triggerContext);
          
          // Check for duplicate (6 hour window to prevent spam)
          if (await isDuplicate(rule.id, dedupHash, 6)) {
            logger.debug({ rule_id: rule.id, chat_id: chatId, hash: dedupHash }, 'Duplicate notification, skipping');
            continue;
          }
          
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
            aiCostUsd: analysis.cost_usd,
          });
          
          triggered = true;
          // Only log when notification is actually triggered
          logger.info({ 
            rule_name: rule.name,
            chat: groupTitle, 
            severity: analysis.severity,
            telegram_sent: sentCount,
            saved_to_db: logResult.success,
            dedup_hash: dedupHash
          }, '🔔 Negative discussion notification');
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
          continue;
        }
        
        if (!rule.use_ai) continue;
        
        const timeoutHours = rule.config.timeout_hours || 2;
        const messages = await getRecentMessages(chatId, timeoutHours * 60 + 30, 50);
        
        if (messages.length < 2) continue;
        
        const analysis = await analyzeUnansweredQuestions(
          messages,
          rule.org_id,
          rule.id,
          timeoutHours
        );
        
        totalAiCost += analysis.cost_usd;
        
        // Send notification for each unanswered question
        for (const question of analysis.questions) {
          const hoursAgo = Math.floor(
            (Date.now() - new Date(question.timestamp).getTime()) / (1000 * 60 * 60)
          );
          
          if (hoursAgo < timeoutHours) continue; // Not yet timed out
          
          const triggerContext = {
            type: 'unanswered_question',
            group_id: chatId,
            group_title: groupTitle,
            question_text: question.text,
            question_author: question.author,
            question_author_id: question.author_id,
            question_time: question.timestamp,
            hours_without_answer: hoursAgo,
            time_ago: `${hoursAgo} ч. назад`,
          };
          
          const dedupHash = generateDedupHash(rule.id, triggerContext);
          
          // Check for duplicate (6 hour window)
          if (await isDuplicate(rule.id, dedupHash, 6)) {
            continue;
          }
          
          const recipients = await getRecipients(rule);
          const message = formatNotificationMessage(rule, triggerContext, groupTitle, chatId);
          
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
          logger.info({
            rule_name: rule.name,
            chat: groupTitle,
            author: question.author,
            hours: hoursAgo,
            telegram_sent: sentCount,
            saved_to_db: logResult.success
          }, '❓ Unanswered question notification');
        }
        break;
      }
      
      case 'group_inactive': {
        const timeoutHours = rule.config.timeout_hours || 24;
        
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
        const hoursInactive = (Date.now() - lastMessageTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursInactive < timeoutHours) continue;
        
        const triggerContext = {
          type: 'group_inactive',
          group_id: chatId,
          group_title: groupTitle,
          last_message_at: lastMessageTime.toLocaleString('ru'),
          inactive_hours: Math.floor(hoursInactive),
        };
        
        const dedupHash = generateDedupHash(rule.id, triggerContext);
        
        if (await isDuplicate(rule.id, dedupHash, 12)) {
          continue;
        }
        
        const recipients = await getRecipients(rule);
        const message = formatNotificationMessage(rule, triggerContext, groupTitle, chatId);
        
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
        });
        
        triggered = true;
        logger.info({
          rule_name: rule.name,
          chat: groupTitle,
          inactive_hours: Math.floor(hoursInactive),
          telegram_sent: sentCount,
          saved_to_db: logResult.success
        }, '💤 Group inactivity notification');
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
  // Get all enabled rules
  const { data: rules, error } = await supabaseAdmin
    .from('notification_rules')
    .select('*')
    .eq('is_enabled', true);
  
  if (error) {
    logger.error({ error: error.message }, 'Error fetching rules');
    return { processed: 0, triggered: 0, totalAiCost: 0 };
  }
  
  if (!rules || rules.length === 0) {
    return { processed: 0, triggered: 0, totalAiCost: 0 };
  }
  
  let triggeredCount = 0;
  let totalAiCost = 0;
  
  for (const rule of rules) {
    try {
      const result = await processRule(rule as NotificationRule);
      
      if (result.triggered) {
        triggeredCount++;
      }
      
      if (result.aiCostUsd) {
        totalAiCost += result.aiCostUsd;
      }
      
      await updateRuleStatus(rule.id, result.triggered);
    } catch (error) {
      logger.error({ error, rule_id: rule.id }, 'Error processing rule');
    }
  }
  
  logger.info({
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

