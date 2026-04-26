import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { sendSystemNotification } from '@/lib/services/telegramNotificationService';

// Helper: retry wrapper for transient failures
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delay?: number; logger?: any } = {}
): Promise<T> {
  const { retries = 2, delay = 1000, logger } = options;
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isTransient = error.message?.includes('fetch failed') ||
                         error.message?.includes('timeout') ||
                         error.message?.includes('Timeout');
      
      if (!isTransient || attempt === retries) {
        throw error;
      }
      
      logger?.debug({ attempt: attempt + 1, error: error.message }, 'Retry after transient failure');
      await new Promise(r => setTimeout(r, delay * (attempt + 1)));
    }
  }
  
  throw lastError;
}

/**
 * POST /api/cron/sync-attention-zones
 * Синхронизирует attention_zone_items с данными о молчунах и неактивных новичках
 * Запускается каждый час
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/cron/sync-attention-zones' });

  // Проверка авторизации (supports both x-cron-secret header and Bearer token)
  const cronSecret = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isValidSecret = (cronSecret && cronSecret === process.env.CRON_SECRET) || (bearerToken && bearerToken === process.env.CRON_SECRET);
  if (!process.env.CRON_SECRET || !isValidSecret) {
    logger.warn({}, 'Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  logger.debug({}, '🔄 Starting attention zones sync');

  try {
    const adminSupabase = createAdminServer();
    
    // Получаем все организации с подключёнными группами (with retry)
    const result = await withRetry(
      async () => {
        const response = await adminSupabase
          .from('org_telegram_groups')
          .select('org_id')
          .not('org_id', 'is', null);
        return response;
      },
      { logger }
    );
    const { data: orgsWithGroups, error: orgsError } = result as { 
      data: { org_id: string }[] | null; 
      error: any; 
    };
    
    if (orgsError) {
      logger.error({ error: orgsError.message }, 'Error fetching organizations');
      throw orgsError;
    }
    
    // Уникальные org_id
    const orgIds = Array.from(new Set(orgsWithGroups?.map(o => o.org_id) || []));
    logger.debug({ org_count: orgIds.length }, 'Found organizations to sync');
    
    let totalChurning = 0;
    let totalNewcomers = 0;
    let totalCriticalEvents = 0;
    let totalUpdated = 0;
    
    for (const orgId of orgIds) {
      try {
        // 0. Sync critical events (low registration rate)
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        
        const { data: upcomingEvents } = await adminSupabase
          .from('events')
          .select('id, title, event_date, start_time, capacity')
          .eq('org_id', orgId)
          .eq('status', 'published')
          .not('capacity', 'is', null)
          .gt('capacity', 0)
          .gte('event_date', new Date().toISOString())
          .lte('event_date', threeDaysFromNow.toISOString());
        
        if (upcomingEvents && upcomingEvents.length > 0) {
          const eventIds = upcomingEvents.map(e => e.id);
          const { data: regs } = await adminSupabase
            .from('event_registrations')
            .select('event_id, status')
            .in('event_id', eventIds)
            .eq('status', 'registered');
          
          const regCounts = new Map<string, number>();
          for (const r of regs || []) {
            regCounts.set(r.event_id, (regCounts.get(r.event_id) || 0) + 1);
          }
          
          const criticalItems = upcomingEvents
            .filter(e => {
              const count = regCounts.get(e.id) || 0;
              const rate = (count / e.capacity) * 100;
              return rate < 30;
            })
            .map(e => ({
              org_id: orgId,
              item_type: 'critical_event',
              item_id: e.id,
              item_data: {
                title: e.title,
                event_date: e.event_date,
                start_time: e.start_time,
                registeredCount: regCounts.get(e.id) || 0,
                capacity: e.capacity,
                registrationRate: Math.round(((regCounts.get(e.id) || 0) / e.capacity) * 100),
              },
            }));
          
          if (criticalItems.length > 0) {
            const { error: upsertError } = await adminSupabase
              .from('attention_zone_items')
              .upsert(criticalItems, {
                onConflict: 'org_id,item_type,item_id',
                ignoreDuplicates: false,
              });
            
            if (upsertError) {
              logger.warn({ org_id: orgId, error: upsertError.message }, 'Error upserting critical events');
            } else {
              totalCriticalEvents += criticalItems.length;
            }
          }
        }

        // 1. Получаем молчунов (churning participants)
        const { data: churningParticipants, error: churningError } = await adminSupabase
          .rpc('get_churning_participants', {
            p_org_id: orgId,
            p_days_silent: 14
          });
        
        if (churningError) {
          logger.warn({ org_id: orgId, error: churningError.message }, 'Error fetching churning participants');
        }
        
        // 2. Получаем неактивных новичков
        const { data: inactiveNewcomers, error: newcomersError } = await adminSupabase
          .rpc('get_inactive_newcomers', {
            p_org_id: orgId,
            p_days_since_first: 14
          });
        
        if (newcomersError) {
          logger.warn({ org_id: orgId, error: newcomersError.message }, 'Error fetching inactive newcomers');
        }
        
        // 3. Upsert attention zone items для молчунов
        const currentChurningIds = new Set<string>();
        if (churningParticipants && churningParticipants.length > 0) {
          const churningItems = churningParticipants.map((p: any) => {
            currentChurningIds.add(p.participant_id);
            return {
              org_id: orgId,
              item_type: 'churning_participant',
              item_id: p.participant_id,
              item_data: {
                full_name: p.full_name,
                username: p.username,
                days_since_activity: p.days_since_activity,
                previous_activity_score: p.previous_activity_score,
              },
            };
          });
          
          const { error: upsertError } = await adminSupabase
            .from('attention_zone_items')
            .upsert(churningItems, { 
              onConflict: 'org_id,item_type,item_id',
              ignoreDuplicates: false 
            });
          
          if (upsertError) {
            logger.warn({ 
              org_id: orgId, 
              error: upsertError.message 
            }, 'Error upserting churning participants');
          } else {
            totalChurning += churningItems.length;
          }
        }

        // 3b. Auto-resolve churning items for participants who became active
        {
          const { data: unresolvedChurning } = await adminSupabase
            .from('attention_zone_items')
            .select('id, item_id')
            .eq('org_id', orgId)
            .eq('item_type', 'churning_participant')
            .is('resolved_at', null);
          
          if (unresolvedChurning && unresolvedChurning.length > 0) {
            const toResolve = unresolvedChurning.filter(
              (item: any) => !currentChurningIds.has(item.item_id)
            );
            
            if (toResolve.length > 0) {
              const resolveIds = toResolve.map((item: any) => item.id);
              await adminSupabase
                .from('attention_zone_items')
                .update({ resolved_at: new Date().toISOString() })
                .in('id', resolveIds);
              
              logger.debug({ 
                org_id: orgId, 
                auto_resolved_churning: toResolve.length 
              }, 'Auto-resolved churning items for active participants');
            }
          }
        }
        
        // 4. Upsert attention zone items для неактивных новичков
        const currentNewcomerIds = new Set<string>();
        if (inactiveNewcomers && inactiveNewcomers.length > 0) {
          const newcomerItems = inactiveNewcomers.map((p: any) => {
            currentNewcomerIds.add(p.participant_id);
            return {
              org_id: orgId,
              item_type: 'inactive_newcomer',
              item_id: p.participant_id,
              item_data: {
                full_name: p.full_name,
                username: p.username,
                days_since_join: p.days_since_join,
                activity_count: p.activity_count,
              },
            };
          });
          
          const { error: upsertError } = await adminSupabase
            .from('attention_zone_items')
            .upsert(newcomerItems, { 
              onConflict: 'org_id,item_type,item_id',
              ignoreDuplicates: false 
            });
          
          if (upsertError) {
            logger.warn({ 
              org_id: orgId, 
              error: upsertError.message 
            }, 'Error upserting inactive newcomers');
          } else {
            totalNewcomers += newcomerItems.length;
          }
        }

        // 4b. Auto-resolve newcomer items for participants who became active
        {
          const { data: unresolvedNewcomers } = await adminSupabase
            .from('attention_zone_items')
            .select('id, item_id')
            .eq('org_id', orgId)
            .eq('item_type', 'inactive_newcomer')
            .is('resolved_at', null);
          
          if (unresolvedNewcomers && unresolvedNewcomers.length > 0) {
            const toResolve = unresolvedNewcomers.filter(
              (item: any) => !currentNewcomerIds.has(item.item_id)
            );
            
            if (toResolve.length > 0) {
              const resolveIds = toResolve.map((item: any) => item.id);
              await adminSupabase
                .from('attention_zone_items')
                .update({ resolved_at: new Date().toISOString() })
                .in('id', resolveIds);
              
              logger.debug({ 
                org_id: orgId, 
                auto_resolved_newcomers: toResolve.length 
              }, 'Auto-resolved newcomer items for active participants');
            }
          }
        }
        
        totalUpdated++;
        
      } catch (orgError: any) {
        logger.error({ 
          org_id: orgId, 
          error: orgError.message 
        }, 'Error processing organization');
      }
    }
    
    // 5. Send Telegram notifications for system rules with send_telegram=true
    let telegramSent = 0;
    try {
      // Find system rules that have send_telegram enabled
      const { data: systemRules } = await adminSupabase
        .from('notification_rules')
        .select('id, org_id, rule_type, notify_owner, notify_admins, config')
        .eq('is_system', true)
        .eq('is_enabled', true)
        .eq('send_telegram', true);
      
      if (systemRules && systemRules.length > 0) {
        for (const rule of systemRules) {
          try {
            // Get new attention items for this org that were just created/updated
            const { data: items } = await adminSupabase
              .from('attention_zone_items')
              .select('item_id, item_type, item_data, created_at')
              .eq('org_id', rule.org_id)
              .eq('item_type', rule.rule_type)
              .is('resolved_at', null)
              .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // Last 2 hours
              .limit(5);
            
            if (!items || items.length === 0) continue;
            
            // Get recipients
            const recipients: Array<{ tgUserId: number; name: string }> = [];
            
            if (rule.notify_owner) {
              const { data: ownerMembership } = await adminSupabase
                .from('memberships')
                .select('user_id')
                .eq('org_id', rule.org_id)
                .eq('role', 'owner')
                .single();
              
              if (ownerMembership?.user_id) {
                const { data: tgId } = await adminSupabase
                  .rpc('get_user_telegram_id', { p_user_id: ownerMembership.user_id });
                
                // Parse RPC result - handle bigint, number, string, object types
                let parsedId: number | null = null;
                if (tgId !== null && tgId !== undefined) {
                  if (typeof tgId === 'bigint' || typeof tgId === 'number') {
                    parsedId = Number(tgId);
                  } else {
                    const p = parseInt(String(tgId), 10);
                    parsedId = isNaN(p) ? null : p;
                  }
                }
                if (parsedId && !isNaN(parsedId)) {
                  recipients.push({ tgUserId: parsedId, name: 'Owner' });
                }
              }
            }
            
            if (rule.notify_admins) {
              const { data: admins } = await adminSupabase
                .from('memberships')
                .select('user_id')
                .eq('org_id', rule.org_id)
                .eq('role', 'admin');
              
              for (const admin of admins || []) {
                const { data: tgId } = await adminSupabase
                  .rpc('get_user_telegram_id', { p_user_id: admin.user_id });
                
                // Parse RPC result - handle bigint, number, string, object types
                let parsedId: number | null = null;
                if (tgId !== null && tgId !== undefined) {
                  if (typeof tgId === 'bigint' || typeof tgId === 'number') {
                    parsedId = Number(tgId);
                  } else {
                    const p = parseInt(String(tgId), 10);
                    parsedId = isNaN(p) ? null : p;
                  }
                }
                if (parsedId && !isNaN(parsedId) && !recipients.find(r => r.tgUserId === parsedId)) {
                  recipients.push({ tgUserId: parsedId, name: 'Admin' });
                }
              }
            }
            
            if (recipients.length === 0) continue;
            
            // Format message based on rule type
            let message = '';
            const typeLabels: Record<string, string> = {
              churning_participant: 'Участники на грани оттока',
              inactive_newcomer: 'Новички без активности',
              critical_event: 'Низкие регистрации на событие',
            };
            
            message = `🔔 *${typeLabels[rule.rule_type] || rule.rule_type}*\n\n`;
            
            for (const item of items.slice(0, 3)) {
              const data = item.item_data as Record<string, any>;
              if (rule.rule_type === 'churning_participant') {
                message += `• ${data.full_name || data.username || 'Участник'} — молчит ${data.days_since_activity} дн.\n`;
              } else if (rule.rule_type === 'inactive_newcomer') {
                message += `• ${data.full_name || data.username || 'Новичок'} — ${data.days_since_join} дн. без активности\n`;
              } else if (rule.rule_type === 'critical_event') {
                message += `• ${data.title} — ${data.registeredCount}/${data.capacity} (${data.registrationRate}%)\n`;
              }
            }
            
            if (items.length > 3) {
              message += `\n_...и ещё ${items.length - 3}_`;
            }
            
            // Send to all recipients
            for (const recipient of recipients) {
              const result = await sendSystemNotification(recipient.tgUserId, message);
              if (result.success) telegramSent++;
            }
          } catch (ruleError: any) {
            logger.warn({ rule_id: rule.id, error: ruleError.message }, 'Error sending system rule Telegram notification');
          }
        }
      }
    } catch (tgError: any) {
      logger.warn({ error: tgError.message }, 'Error processing Telegram notifications for system rules');
    }

    // 6. Auto-resolve critical_event items for events that have already passed
    {
      const { data: unresolvedCritical } = await adminSupabase
        .from('attention_zone_items')
        .select('id, item_id, item_data')
        .eq('item_type', 'critical_event')
        .is('resolved_at', null);
      
      if (unresolvedCritical && unresolvedCritical.length > 0) {
        const now = new Date();
        const expiredIds = unresolvedCritical
          .filter((item: any) => {
            const eventDate = item.item_data?.event_date;
            return eventDate && new Date(eventDate) < now;
          })
          .map((item: any) => item.id);
        
        if (expiredIds.length > 0) {
          await adminSupabase
            .from('attention_zone_items')
            .update({ resolved_at: now.toISOString(), resolved_by_name: 'Авто: событие прошло' })
            .in('id', expiredIds);
          
          logger.info({ count: expiredIds.length }, 'Auto-resolved critical events (event date passed)');
        }
      }
    }

    // 7. Auto-resolve group_inactive notification_logs when activity has resumed
    {
      const { data: unresolvedInactivity } = await adminSupabase
        .from('notification_logs')
        .select('id, trigger_context')
        .eq('rule_type', 'group_inactive')
        .eq('notification_status', 'sent')
        .is('resolved_at', null);
      
      if (unresolvedInactivity && unresolvedInactivity.length > 0) {
        const resolveIds: string[] = [];
        
        for (const notif of unresolvedInactivity) {
          const ctx = notif.trigger_context as Record<string, any>;
          const chatId = ctx?.group_id;
          const lastMessageTimestamp = ctx?.last_message_timestamp;
          
          if (!chatId || !lastMessageTimestamp) continue;
          
          // Check if there are newer messages than the one that triggered the notification
          const { data: newerMessage } = await adminSupabase
            .from('activity_events')
            .select('id')
            .eq('tg_chat_id', chatId)
            .eq('event_type', 'message')
            .gt('created_at', lastMessageTimestamp)
            .limit(1)
            .single();
          
          if (newerMessage) {
            resolveIds.push(notif.id);
          }
        }
        
        if (resolveIds.length > 0) {
          await adminSupabase
            .from('notification_logs')
            .update({ resolved_at: new Date().toISOString(), resolved_by_name: 'Авто: активность возобновилась' })
            .in('id', resolveIds);
          
          logger.info({ count: resolveIds.length }, 'Auto-resolved inactivity notifications (activity resumed)');
        }
      }
    }

    // 8. Очистка старых resolved items (старше 7 дней)
    const { error: cleanupError } = await adminSupabase
      .from('attention_zone_items')
      .delete()
      .not('resolved_at', 'is', null)
      .lt('resolved_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    if (cleanupError) {
      logger.warn({ error: cleanupError.message }, 'Error cleaning up old resolved items');
    }
    
    const duration = Date.now() - startTime;
    
    // Only log info if we actually updated something, otherwise debug
    const hasUpdates = totalChurning > 0 || totalNewcomers > 0 || totalCriticalEvents > 0;
    const logMethod = hasUpdates ? logger.info.bind(logger) : logger.debug.bind(logger);
    
    logMethod({
      orgs_processed: totalUpdated,
      churning_items: totalChurning,
      newcomer_items: totalNewcomers,
      critical_event_items: totalCriticalEvents,
      telegram_sent: telegramSent,
      duration_ms: duration,
    }, hasUpdates ? '✅ Attention zones sync completed with updates' : 'Attention zones sync completed (no changes)');
    
    return NextResponse.json({
      success: true,
      orgs_processed: totalUpdated,
      churning_items: totalChurning,
      newcomer_items: totalNewcomers,
      critical_event_items: totalCriticalEvents,
      telegram_sent: telegramSent,
      duration_ms: duration,
    });
    
  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Attention zones sync failed');
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}

// GET для ручного запуска из браузера (только с авторизацией)
export async function GET(request: NextRequest) {
  return POST(request);
}

