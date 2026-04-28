import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { createEventProcessingService } from '@/lib/services/eventProcessingService'
import { verifyTelegramAuthCode } from '@/lib/services/telegramAuthService'
import { webhookRecoveryService } from '@/lib/services/webhookRecoveryService'
import { updateParticipantActivity, incrementGroupMessageCount } from '@/lib/services/participantStatsService'
import { createAPILogger, createServiceLogger } from '@/lib/logger'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'
import { 
  processMessage as processMessageOptimized,
  isWebhookProcessed,
  recordWebhookProcessed 
} from '@/lib/services/webhookProcessingService'
import {
  processChannelPost,
  processEditedChannelPost,
  processChannelReaction
} from '@/lib/services/channelEventService'

// Feature flag for optimized processing (set to true to enable)
const USE_OPTIMIZED_PROCESSING = process.env.USE_OPTIMIZED_WEBHOOK === 'true';

export const dynamic = 'force-dynamic';

// Ленивая инициализация админского клиента (теперь через createAdminServer)
let _supabaseServiceRole: ReturnType<typeof createAdminServer> | null = null;
function getSupabaseServiceRole() {
  if (!_supabaseServiceRole) {
    _supabaseServiceRole = createAdminServer();
  }
  return _supabaseServiceRole;
}
const supabaseServiceRole = getSupabaseServiceRole();

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { webhook: 'main' });
  logger.debug('Webhook received');
  
  // Проверяем секретный токен
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET!
  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token');
  logger.debug({ 
    endpoint: '/api/telegram/webhook',
    botType: 'MAIN',
    hasSecret: !!secret, 
    receivedMatches: receivedSecret === secret,
    secretLength: secret?.length,
    receivedSecretLength: receivedSecret?.length
  }, 'Secret token check');
  
  if (receivedSecret !== secret) {
    logger.error({ 
      endpoint: '/api/telegram/webhook',
      botType: 'MAIN',
      expectedSecretLength: secret?.length,
      receivedSecretLength: receivedSecret?.length
    }, 'Unauthorized - secret token mismatch');
    
    // 🔧 Автоматическое восстановление webhook
    logger.info('Attempting automatic webhook recovery');
    webhookRecoveryService.recoverWebhook('main', 'secret_token_mismatch').catch(err => {
      logger.error({ error: err }, 'Recovery failed');
    });
    
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const body = await req.json()
    
    // Определяем тип update
    const updateTypes = [];
    if (body.message) updateTypes.push('message');
    if (body.edited_message) updateTypes.push('edited_message');
    if (body.channel_post) updateTypes.push('channel_post');
    if (body.edited_channel_post) updateTypes.push('edited_channel_post');
    if (body.message_reaction) updateTypes.push('message_reaction');
    if (body.message_reaction_count) updateTypes.push('message_reaction_count');
    if (body.my_chat_member) updateTypes.push('my_chat_member');
    if (body.chat_member) updateTypes.push('chat_member');
    if (body.chat_join_request) updateTypes.push('chat_join_request');
    if (body.callback_query) updateTypes.push('callback_query');
    if (body.inline_query) updateTypes.push('inline_query');
    
    logger.debug({ 
      update_id: body?.update_id,
      update_types: updateTypes,
      chat_id: body?.message?.chat?.id || body?.channel_post?.chat?.id || body?.my_chat_member?.chat?.id || body?.message_reaction?.chat?.id || body?.message_reaction_count?.chat?.id,
      chat_type: body?.message?.chat?.type || body?.channel_post?.chat?.type || body?.my_chat_member?.chat?.type || body?.message_reaction?.chat?.type || body?.message_reaction_count?.chat?.type,
      user_id: body?.message?.from?.id || body?.message_reaction?.user?.id,
      has_text: !!(body?.message?.text || body?.channel_post?.text)
    }, '📨 [WEBHOOK] Received update');
    
    // ⚡ НЕМЕДЛЕННЫЙ ОТВЕТ: Telegram требует ответ в течение 60 секунд
    // Обрабатываем в фоне без блокировки ответа
    
    // Запускаем обработку в фоне (не ждём!)
    processWebhookInBackground(body, logger).catch((error) => {
      logger.error({
        update_id: body?.update_id,
        chat_id: body?.message?.chat?.id || body?.my_chat_member?.chat?.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Background webhook processing failed');
    });
    
    // Сразу возвращаем успешный ответ
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      error_type: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error parsing webhook request');
    // Log parsing error
    await logErrorToDatabase({
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error parsing webhook request',
      errorCode: 'WEBHOOK_PROCESSING_ERROR',
      context: {
        endpoint: '/api/telegram/webhook',
        reason: 'request_parse_error',
        errorType: error instanceof Error ? error.constructor.name : typeof error
      },
      stackTrace: error instanceof Error ? error.stack : undefined
    })
    // Всегда возвращаем успешный ответ Telegram, чтобы избежать повторных запросов
    return NextResponse.json({ ok: true });
  }
}

/**
 * Обработка webhook в фоне
 * Эта функция выполняется асинхронно после возврата ответа Telegram
 */
async function processWebhookInBackground(body: any, logger: ReturnType<typeof createAPILogger>) {
  const updateId = body.update_id;
  let chatId: number | null = null;
  let orgId: string | null = null;
  const startTime = Date.now();
  
  try {
    logger.debug({ update_id: updateId }, 'Processing webhook update');
    
    // ========================================
    // STEP 0: IDEMPOTENCY CHECK
    // ========================================
    if (updateId) {
      // Use optimized RPC check if available, fallback to direct query
      let isDuplicate = false;
      
      if (USE_OPTIMIZED_PROCESSING) {
        isDuplicate = await isWebhookProcessed(updateId);
      } else {
        const { data: exists } = await supabaseServiceRole
          .from('telegram_webhook_idempotency')
          .select('update_id')
          .eq('update_id', updateId)
          .single();
        isDuplicate = !!exists;
      }
      
      if (isDuplicate) {
        logger.debug({ update_id: updateId }, 'Duplicate update - skipping');
        return; // Already processed
      }
    }
    
    logger.debug({ 
      has_message: !!body.message,
      has_text: !!body?.message?.text,
      message_type: body?.message?.chat?.type,
      from_id: body?.message?.from?.id,
      chat_id: body?.message?.chat?.id
    }, 'Webhook update structure');
    
    // Проверяем, существует ли группа в базе данных и добавляем, если нет
    // ТОЛЬКО для групповых чатов (не для private)
    if (body.message?.chat?.id && body.message?.chat?.type !== 'private') {
      chatId = body.message.chat.id;
      const title = body.message.chat.title || `Group ${chatId}`;
      
      try {
        const { data: existingGroup } = await supabaseServiceRole
          .from('telegram_groups')
          .select('id, bot_status')
          .filter('tg_chat_id::text', 'eq', String(chatId))
          .limit(1);
        
        if (existingGroup && existingGroup.length > 0) {
          await supabaseServiceRole
            .from('telegram_groups')
            .update({
              title: title,
              last_sync_at: new Date().toISOString()
            })
            .eq('id', existingGroup[0].id);
        } else {
          // ⚠️ Проверяем, есть ли группы с таким же названием (потенциальный дубликат)
          const { data: sameNameGroups } = await supabaseServiceRole
            .from('telegram_groups')
            .select('id, tg_chat_id, title, migrated_to')
            .eq('title', title)
            .neq('tg_chat_id', String(chatId))
            .is('migrated_to', null);
          
          if (sameNameGroups && sameNameGroups.length > 0) {
            logger.warn({
              new_chat_id: chatId,
              new_title: title,
              existing_groups: sameNameGroups.map(g => ({
                id: g.id,
                tg_chat_id: g.tg_chat_id
              })),
              potential_migration: sameNameGroups.some(g => 
                String(chatId).startsWith('-100') && !String(g.tg_chat_id).startsWith('-100')
              )
            }, 'New group has same title as existing group(s) - potential duplicate or unhandled migration');
          }
          
          // 🔄 Используем upsert с onConflict для обработки уникального индекса
          const { error: insertError } = await supabaseServiceRole
            .from('telegram_groups')
            .upsert({
              tg_chat_id: String(chatId),
              title: title,
              bot_status: 'pending',
              last_sync_at: new Date().toISOString()
            }, { onConflict: 'tg_chat_id' });
          
          if (insertError) {
            logger.error({ 
              chat_id: chatId,
              error: insertError.message 
            }, 'Error creating group');
          } else {
            logger.info({ chat_id: chatId, title }, 'New group created');
          }
        }
      } catch (error) {
        logger.error({ 
          chat_id: chatId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Group processing error');
      }
    }
    
    // Обрабатываем событие ТОЛЬКО для групп, добавленных в организацию
    if (body.message?.chat?.type !== 'private' && body.message?.chat?.id) {
      const msgChatId = body.message.chat.id;
      
      const { data: orgMapping } = await supabaseServiceRole
        .from('org_telegram_groups')
        .select('org_id')
        .filter('tg_chat_id::text', 'eq', String(msgChatId))
        .limit(1);
      
      if (orgMapping && orgMapping.length > 0 && orgMapping[0].org_id) {
        orgId = orgMapping[0].org_id;
        
        logger.debug({
          chat_id: msgChatId,
          org_id: orgId,
          user_id: body.message?.from?.id,
          username: body.message?.from?.username,
          chat_type: body.message.chat.type,
        }, '📝 [WEBHOOK] Processing message from org group');
        
        // Use optimized processing if enabled
        if (USE_OPTIMIZED_PROCESSING && body.message?.from?.id && orgId) {
          // ⚡ Optimized path: 1 RPC call instead of 8-12 queries
          const result = await processMessageOptimized(orgId, body.message, updateId);
          
          if (!result.success) {
            logger.warn({ 
              error: result.error,
              tg_user_id: body.message.from.id 
            }, 'Optimized processing failed, falling back');
            
            // Fallback to legacy processing
            const eventProcessingService = createEventProcessingService();
            eventProcessingService.setSupabaseClient(supabaseServiceRole);
            await eventProcessingService.processUpdate(body);
          }
        } else {
          // Legacy path: multiple DB queries
          const eventProcessingService = createEventProcessingService();
          eventProcessingService.setSupabaseClient(supabaseServiceRole);
          
          try {
            await eventProcessingService.processUpdate(body);
            
            logger.debug({
              chat_id: msgChatId,
              user_id: body.message?.from?.id,
              org_id: orgId
            }, '✅ [WEBHOOK] Message processed successfully');
          } catch (error) {
            logger.error({
              chat_id: msgChatId,
              user_id: body.message?.from?.id,
              org_id: orgId,
              error: error instanceof Error ? error.message : String(error)
            }, '❌ [WEBHOOK] Failed to process message');
          }
          
          // Update participant activity stats (lightweight, no enrichment)
          if (body.message?.from?.id && orgId) {
            updateParticipantActivity(body.message.from.id, orgId).catch(() => {});
            incrementGroupMessageCount(msgChatId).catch(() => {});
          }
        }
        
        // STEP 2.3: Check if this is a discussion group for a channel
        // If so, track as channel comment
        const { data: linkedChannel } = await supabaseServiceRole
          .from('telegram_channels')
          .select('id, tg_chat_id, title')
          .eq('linked_chat_id', msgChatId)
          .maybeSingle();
        
        if (linkedChannel && body.message?.from?.id) {
          const userId = body.message.from.id;
          const username = body.message.from.username || null;
          const firstName = body.message.from.first_name || null;
          const lastName = body.message.from.last_name || null;
          
          // Filter out system accounts (Telegram service, bots, etc.)
          const SYSTEM_ACCOUNT_IDS = [
            777000,      // Telegram Service Notifications
            136817688,   // @Channel_Bot
            1087968824   // Group Anonymous Bot
          ];
          
          if (SYSTEM_ACCOUNT_IDS.includes(userId)) {
            logger.debug({ user_id: userId, username, first_name: firstName }, '⏭️ [WEBHOOK] Skipping system account');
            // Skip system accounts - don't create participants or activity events
          } else {
            logger.info({
              chat_id: msgChatId,
              channel_id: linkedChannel.tg_chat_id,
              user_id: userId,
              username,
              first_name: firstName
            }, '💬 [WEBHOOK] Channel comment detected');
            
            try {
              // Update/create channel subscriber
              await supabaseServiceRole.rpc('upsert_channel_subscriber_from_comment', {
              p_channel_tg_id: linkedChannel.tg_chat_id,
              p_tg_user_id: userId,
              p_username: username,
              p_first_name: firstName,
              p_last_name: lastName
            });
            
            // Create activity_event for channel comment
            if (orgId) {
              const messageId = body.message.message_id;
              const text = body.message.text || body.message.caption || '';
              const replyToMessageId = body.message.reply_to_message?.message_id || null;
              
              await supabaseServiceRole.from('activity_events').insert({
                org_id: orgId,
                tg_chat_id: msgChatId,
                tg_user_id: userId,
                message_id: messageId,
                reply_to_message_id: replyToMessageId,
                event_type: 'channel_comment',
                chars_count: text.length,
                meta: {
                  channel_id: linkedChannel.tg_chat_id,
                  channel_title: linkedChannel.title,
                  text_preview: text.substring(0, 100)
                }
              });
            }
            
            logger.info({
              channel_id: linkedChannel.tg_chat_id,
              user_id: userId,
              org_id: orgId
            }, '✅ [WEBHOOK] Channel subscriber and activity_event updated');
            } catch (error) {
              logger.error({
                error: error instanceof Error ? error.message : String(error),
                channel_id: linkedChannel.tg_chat_id,
                user_id: userId
              }, '❌ [WEBHOOK] Failed to update channel subscriber');
            }
          } // Close else block
        }
      } else {
        logger.debug({
          chat_id: msgChatId,
          chat_type: body.message.chat.type
        }, '⏭️ [WEBHOOK] Group not in org, skipping');
      }
    }
    
    // STEP 2.5: Обработка изменений статуса бота (my_chat_member)
    if (body.my_chat_member) {
      const chatMember = body.my_chat_member;
      const botUserId = chatMember.new_chat_member?.user?.id;
      
      // Проверяем, что это наш бот
      if (botUserId === 8355772450) {
        const memberChatId = chatMember.chat?.id;
        const newStatus = chatMember.new_chat_member?.status;
        
        if (memberChatId && memberChatId !== 'null' && newStatus) {
          let botStatus = 'pending';
          if (newStatus === 'administrator') botStatus = 'connected';
          else if (newStatus === 'left' || newStatus === 'kicked') botStatus = 'inactive';
          
          const chatTitle = chatMember.chat?.title || `Chat ${memberChatId}`;
          
          logger.info({ 
            chat_id: memberChatId,
            chat_title: chatTitle,
            bot_status: botStatus,
            new_status: newStatus,
            chat_type: chatMember.chat?.type
          }, 'Bot status changed');
          
          // Проверяем, существует ли уже группа
          const { data: existingGroup } = await supabaseServiceRole
            .from('telegram_groups')
            .select('id, title, bot_status')
            .eq('tg_chat_id', String(memberChatId))
            .maybeSingle();
          
          // ⚠️ Проверяем на дубликаты по названию для новых групп
          if (!existingGroup) {
            const { data: sameNameGroups } = await supabaseServiceRole
              .from('telegram_groups')
              .select('id, tg_chat_id, bot_status, migrated_to')
              .eq('title', chatTitle)
              .neq('tg_chat_id', String(memberChatId))
              .is('migrated_to', null);

            if (sameNameGroups && sameNameGroups.length > 0) {
              const isSupergroup = String(memberChatId).startsWith('-100');
              // Auto-merge: new supergroup + old basic group with same title, no parallel activity
              const basicOld = sameNameGroups.find(g =>
                isSupergroup && !String(g.tg_chat_id).startsWith('-100')
              );

              if (basicOld) {
                logger.info({
                  old_chat_id: basicOld.tg_chat_id,
                  new_chat_id: memberChatId,
                  title: chatTitle,
                }, 'Auto-merging basic group into supergroup (same title)');

                try {
                  const { data: migrationResult, error: migrationError } = await supabaseServiceRole
                    .rpc('migrate_telegram_chat_id', {
                      old_chat_id: Number(basicOld.tg_chat_id),
                      new_chat_id: Number(memberChatId)
                    });

                  if (migrationError) {
                    logger.error({ error: migrationError.message, old_chat_id: basicOld.tg_chat_id, new_chat_id: memberChatId }, 'Auto-merge migration failed');
                  } else {
                    logger.info({ result: migrationResult, old_chat_id: basicOld.tg_chat_id, new_chat_id: memberChatId }, 'Auto-merge migration completed');
                  }
                } catch (mergeErr) {
                  logger.error({ error: mergeErr instanceof Error ? mergeErr.message : String(mergeErr) }, 'Auto-merge exception');
                }
              } else {
                logger.warn({
                  new_chat_id: memberChatId,
                  new_title: chatTitle,
                  existing_groups: sameNameGroups.map(g => ({
                    id: g.id,
                    tg_chat_id: g.tg_chat_id,
                    bot_status: g.bot_status
                  })),
                }, 'Bot added to group with same title as existing - potential duplicate (no auto-merge: both supergroups or both basic)');
              }
            }
          } else if (existingGroup.bot_status !== botStatus) {
            logger.info({
              chat_id: memberChatId,
              chat_title: chatTitle,
              old_bot_status: existingGroup.bot_status,
              new_bot_status: botStatus
            }, 'Bot status transition');
          }
          
          // Upsert group so that it appears in available groups even если еще не было сообщений
          const { error: upsertError } = await supabaseServiceRole
            .from('telegram_groups')
            .upsert({
              tg_chat_id: String(memberChatId),
              title: chatTitle,
              bot_status: botStatus,
              last_sync_at: new Date().toISOString()
            }, { onConflict: 'tg_chat_id' });
          
          if (upsertError) {
            logger.error({
              chat_id: memberChatId,
              chat_title: chatTitle,
              error: upsertError.message,
              error_code: (upsertError as any).code
            }, 'Bot status upsert error');
          }

          // Сразу синкаем админов группы, чтобы она появилась в "доступных"
          if (botStatus === 'connected' || botStatus === 'pending') {
            try {
              const tgService = createTelegramService('main');
              const adminsResp = await tgService.getChatAdministrators(Number(memberChatId));
              if (adminsResp?.ok && adminsResp.result) {
                for (const admin of adminsResp.result) {
                  if (admin.user?.is_bot || !admin.user?.id) continue;
                  const isAdmin = admin.status === 'administrator' || admin.status === 'creator';
                  await supabaseServiceRole
                    .from('telegram_group_admins')
                    .upsert({
                      tg_chat_id: Number(memberChatId),
                      tg_user_id: admin.user.id,
                      is_admin: isAdmin,
                      is_owner: admin.status === 'creator',
                      verified_at: new Date().toISOString(),
                      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    }, { onConflict: 'tg_chat_id,tg_user_id' });
                }
                logger.info({ chat_id: memberChatId, admins_count: adminsResp.result.length }, 'Synced group admins on bot add');
              }
            } catch (adminSyncErr) {
              logger.warn({ chat_id: memberChatId, error: adminSyncErr instanceof Error ? adminSyncErr.message : String(adminSyncErr) }, 'Failed to sync admins on bot add');
            }
          }
        }
      }
    }
    
    // STEP 2.6: Обработка изменений статуса администраторов (chat_member)
    if (body.chat_member) {
      const chatMember = body.chat_member;
      const adminChatId = chatMember.chat?.id;
      const userId = chatMember.new_chat_member?.user?.id;
      const newStatus = chatMember.new_chat_member?.status;
      const oldStatus = chatMember.old_chat_member?.status;

      // Auto-approve application when user joins the group (via Telegram directly)
      const userJoined = ['member', 'administrator', 'creator'].includes(newStatus) &&
        !['member', 'administrator', 'creator'].includes(oldStatus);

      if (userJoined && adminChatId && userId) {
        try {
          // Find org for this group
          const { data: orgBinding } = await supabaseServiceRole
            .from('org_telegram_groups')
            .select('org_id')
            .eq('tg_chat_id', adminChatId)
            .limit(1)
            .maybeSingle();

          if (orgBinding?.org_id) {
            // Find pending application for this user in this group
            const { data: pendingApp } = await supabaseServiceRole
              .from('applications')
              .select('id, stage_id, form_id, notes')
              .eq('org_id', orgBinding.org_id)
              .eq('tg_chat_id', adminChatId)
              .eq('tg_user_id', userId)
              .maybeSingle();

            if (pendingApp) {
              // Skip if already in a terminal stage
              const { data: currentStage } = await supabaseServiceRole
                .from('pipeline_stages')
                .select('is_terminal')
                .eq('id', pendingApp.stage_id)
                .maybeSingle();

              if (!currentStage?.is_terminal && pendingApp.form_id) {
                // Find pipeline via form, then find its terminal-success stage
                const { data: formData } = await supabaseServiceRole
                  .from('application_forms')
                  .select('pipeline_id')
                  .eq('id', pendingApp.form_id)
                  .single();

                if (formData?.pipeline_id) {
                  const { data: approveStage } = await supabaseServiceRole
                    .from('pipeline_stages')
                    .select('id, name')
                    .eq('pipeline_id', formData.pipeline_id)
                    .eq('is_terminal', true)
                    .eq('terminal_type', 'success')
                    .order('position')
                    .limit(1)
                    .maybeSingle();

                  if (approveStage) {
                    const autoNote = '[Авто: принят через Telegram]';
                    await supabaseServiceRole
                      .from('applications')
                      .update({
                        stage_id: approveStage.id,
                        processed_at: new Date().toISOString(),
                        notes: pendingApp.notes
                          ? `${pendingApp.notes}\n${autoNote}`
                          : autoNote
                      })
                      .eq('id', pendingApp.id);

                    logger.info({
                      application_id: pendingApp.id,
                      stage_id: approveStage.id,
                      stage_name: approveStage.name,
                      user_id: userId,
                      chat_id: adminChatId,
                      org_id: orgBinding.org_id
                    }, '✅ [WEBHOOK] Application auto-approved: user joined group via Telegram');
                  }
                }
              }
            }
          }
        } catch (autoApproveError) {
          logger.warn({
            error: autoApproveError instanceof Error ? autoApproveError.message : String(autoApproveError),
            user_id: userId,
            chat_id: adminChatId
          }, '⚠️ [WEBHOOK] Failed to auto-approve application on member join');
        }
      }
      
      const wasAdmin = oldStatus === 'administrator' || oldStatus === 'creator';
      const isAdmin = newStatus === 'administrator' || newStatus === 'creator';
      
      if (wasAdmin !== isAdmin) {
        logger.info({ 
          user_id: userId,
          chat_id: adminChatId,
          was_admin: wasAdmin,
          is_admin: isAdmin,
          new_status: newStatus
        }, 'Admin rights changed');
        
        // Обновляем права для конкретного пользователя в группе
        if (adminChatId && userId) {
          const isOwner = newStatus === 'creator';
          
          await supabaseServiceRole
            .from('telegram_group_admins')
            .update({
              is_admin: false,
              is_owner: false,
              verified_at: new Date().toISOString(),
              expires_at: new Date().toISOString()
            })
            .eq('tg_chat_id', adminChatId)
            .eq('tg_user_id', userId);
          
          if (isAdmin) {
            const { error: upsertError } = await supabaseServiceRole
              .from('telegram_group_admins')
              .upsert({
                tg_chat_id: adminChatId,
                tg_user_id: userId,
                is_admin: true,
                is_owner: isOwner,
                verified_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
              }, {
                onConflict: 'tg_chat_id,tg_user_id'
              });
            
            if (upsertError) {
              logger.error({ 
                chat_id: adminChatId,
                user_id: userId,
                error: upsertError.message 
              }, 'Admin rights upsert error');
            }
          }
          
          // Синхронизируем memberships для организации
          const { data: orgBindings } = await supabaseServiceRole
            .from('org_telegram_groups')
            .select('org_id')
            .eq('tg_chat_id', adminChatId);
          
          if (orgBindings && orgBindings.length > 0) {
            for (const binding of orgBindings) {
              const { error: syncError } = await supabaseServiceRole.rpc(
                'sync_telegram_admins',
                { p_org_id: binding.org_id }
              );
              
              if (syncError) {
                logger.error({ 
                  org_id: binding.org_id,
                  chat_id: adminChatId,
                  error: syncError.message
                }, 'Membership sync error');
              }
            }
          }
        }
      }

      // ────────────────────────────────────────────────────────────────
      // Leave / kick / ban handling
      // Telegram sends a chat_member update with new_chat_member.status set to
      // 'left' (user left voluntarily), 'kicked' (banned by admin), or
      // 'restricted' with is_member=false (banned but not removed). When this
      // happens, we mark the corresponding participant_groups row so the org's
      // CRM stops counting them as active group members.
      //
      // Without this handler the count grows forever — every join adds a row,
      // no leave ever clears one. Periodic reconciliation in the
      // telegramMemberSyncService also helps, but webhook-driven updates are
      // the canonical real-time signal.
      // ────────────────────────────────────────────────────────────────
      const wasInGroup = ['member', 'administrator', 'creator'].includes(oldStatus) ||
        (oldStatus === 'restricted' && (chatMember.old_chat_member as any)?.is_member === true);
      const userLeft = ['left', 'kicked'].includes(newStatus) ||
        (newStatus === 'restricted' && (chatMember.new_chat_member as any)?.is_member === false);

      if (wasInGroup && userLeft && adminChatId && userId) {
        try {
          // Find every org bound to this group — the same chat may be linked
          // to more than one org during transitions; mark in all.
          const { data: bindings } = await supabaseServiceRole
            .from('org_telegram_groups')
            .select('org_id')
            .eq('tg_chat_id', adminChatId);

          for (const b of (bindings || [])) {
            const { data: participant } = await supabaseServiceRole
              .from('participants')
              .select('id')
              .eq('org_id', b.org_id)
              .eq('tg_user_id', userId)
              .is('merged_into', null)
              .maybeSingle();

            if (!participant) continue;

            const { error: leftErr } = await supabaseServiceRole
              .from('participant_groups')
              .update({ left_at: new Date().toISOString(), is_active: false })
              .eq('participant_id', participant.id)
              .eq('tg_group_id', adminChatId)
              .is('left_at', null);

            if (leftErr) {
              logger.warn({
                org_id: b.org_id,
                participant_id: participant.id,
                chat_id: adminChatId,
                error: leftErr.message,
              }, 'Failed to mark participant as left');
            } else {
              logger.info({
                org_id: b.org_id,
                participant_id: participant.id,
                tg_user_id: userId,
                chat_id: adminChatId,
                old_status: oldStatus,
                new_status: newStatus,
              }, 'Participant marked as left group');
            }
          }
        } catch (leaveErr: any) {
          logger.warn({
            error: leaveErr?.message,
            user_id: userId,
            chat_id: adminChatId,
          }, 'Error processing chat_member leave/kick event');
        }
      }
    }

    // ========================================
    // STEP 2.6.1: Обработка заявок на вступление (chat_join_request)
    // ========================================
    if (body.chat_join_request) {
      const joinRequest = body.chat_join_request;
      const requestChatId = joinRequest.chat?.id;
      const userId = joinRequest.from?.id;
      const inviteLink = joinRequest.invite_link;
      
      logger.debug({
        chat_id: requestChatId,
        user_id: userId,
        username: joinRequest.from?.username,
        first_name: joinRequest.from?.first_name,
        bio: joinRequest.bio?.substring(0, 50),
        invite_link: inviteLink?.invite_link
      }, '📥 [WEBHOOK] Received chat_join_request');
      
      if (requestChatId && userId) {
        try {
          // Find pipeline linked to this group
          // Note: telegram_group_id is BIGINT, requestChatId is number
          const { data: pipeline, error: pipelineError } = await supabaseServiceRole
            .from('application_pipelines')
            .select('id, org_id')
            .eq('telegram_group_id', requestChatId)
            .eq('pipeline_type', 'join_request')
            .eq('is_active', true)
            .maybeSingle();
          
          logger.debug({
            chat_id: requestChatId,
            pipeline_found: !!pipeline,
            pipeline_error: pipelineError?.message,
            pipeline_id: pipeline?.id
          }, '🔍 [WEBHOOK] Pipeline lookup result');
          
          if (!pipeline) {
            logger.debug({
              chat_id: requestChatId
            }, '⏭️ [WEBHOOK] No pipeline linked to this group for join_request');
          }
          
          if (pipeline) {
            // Check for existing application from this user for THIS GROUP (not just form)
            // This prevents duplicates when user clicks join request button multiple times
            // or when there are multiple forms for the same pipeline
            const { data: existingApp } = await supabaseServiceRole
              .from('applications')
              .select('id, form_id')
              .eq('tg_chat_id', requestChatId)
              .eq('tg_user_id', userId)
              .maybeSingle();
            
            if (existingApp) {
              logger.debug({
                chat_id: requestChatId,
                user_id: userId,
                existing_application_id: existingApp.id,
                existing_form_id: existingApp.form_id
              }, '⏭️ [WEBHOOK] Application already exists for this user and group, skipping duplicate');
              // Skip creation - application already exists
            } else {
            // Get first form for this pipeline (for backwards compatibility)
            // Native join requests don't require a specific form, but RPC needs form_id
            const { data: form } = await supabaseServiceRole
              .from('application_forms')
              .select('id')
              .eq('pipeline_id', pipeline.id)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();
            
            const formId = form?.id || null;
            
            logger.debug({
              pipeline_id: pipeline.id,
              form_found: !!form,
              form_id: formId
            }, '🔍 [WEBHOOK] Form lookup result for native join request');
            
            let resolvedFormId = formId;

            // No form exists — auto-create a minimal default form so the join request is recorded
            if (!resolvedFormId) {
              logger.info({
                chat_id: requestChatId,
                pipeline_id: pipeline.id
              }, '⚠️ [WEBHOOK] Pipeline has no forms — auto-creating default form');

              const { data: newForm, error: formCreateError } = await supabaseServiceRole
                .from('application_forms')
                .insert({
                  org_id: pipeline.org_id,
                  pipeline_id: pipeline.id,
                  name: 'Заявка (авто)',
                  form_schema: [],
                  landing: {},
                  success_page: {},
                  settings: {},
                  is_active: true
                })
                .select('id')
                .single();

              if (formCreateError || !newForm) {
                logger.error({
                  chat_id: requestChatId,
                  pipeline_id: pipeline.id,
                  error: formCreateError?.message
                }, '❌ [WEBHOOK] Failed to auto-create default form, dropping join request');
              } else {
                resolvedFormId = newForm.id;
                logger.info({
                  chat_id: requestChatId,
                  pipeline_id: pipeline.id,
                  form_id: resolvedFormId
                }, '✅ [WEBHOOK] Default form auto-created for pipeline');
              }
            }

            if (resolvedFormId) {
            // Prepare tg_user_data with bio (available in join_request)
            // Note: photo_url is not available in join_request, so we don't include it
            // This way spam_score won't penalize for "no_photo"
            const tgUserData: Record<string, any> = {
              first_name: joinRequest.from?.first_name || '',
              last_name: joinRequest.from?.last_name || null,
              username: joinRequest.from?.username || null
            };
            // Only add bio if it exists (bio IS available in join_request!)
            if (joinRequest.bio) {
              tgUserData.bio = joinRequest.bio;
            }
            
            // Create application via RPC
            const { data: applicationId, error: createError } = await supabaseServiceRole.rpc(
              'create_application',
              {
                p_org_id: pipeline.org_id,
                p_form_id: resolvedFormId,
                p_tg_user_id: userId,
                p_tg_chat_id: requestChatId,
                p_tg_user_data: tgUserData,
                p_form_data: {},
                p_source_code: inviteLink?.name || null,
                p_utm_data: {
                  source: 'native_telegram',
                  type: 'join_request',
                  invite_link: inviteLink?.invite_link || null,
                  invite_link_name: inviteLink?.name || null
                }
              }
            );
            
            if (createError) {
              logger.error({
                error: createError.message,
                chat_id: requestChatId,
                user_id: userId,
                pipeline_id: pipeline.id
              }, '❌ [WEBHOOK] Failed to create application from join_request');
            } else {
              logger.info({
                application_id: applicationId,
                chat_id: requestChatId,
                user_id: userId,
                pipeline_id: pipeline.id,
                form_id: resolvedFormId,
                source: 'native_telegram'
              }, '✅ [WEBHOOK] Application created from native Telegram join_request');
            }
            } // Close if (resolvedFormId) block
            } // Close else block for existing app check
          }
        } catch (joinRequestError) {
          logger.error({
            error: joinRequestError instanceof Error ? joinRequestError.message : String(joinRequestError),
            chat_id: requestChatId,
            user_id: userId
          }, '❌ [WEBHOOK] Exception processing chat_join_request');
        }
      }
    }
    
    // ========================================
    // STEP 2.7: Обработка миграции группы в supergroup (migrate_to_chat_id)
    // ========================================
    if (body.message?.migrate_to_chat_id) {
      const oldChatId = body.message.chat.id;
      const newChatId = body.message.migrate_to_chat_id;
      const chatTitle = body.message.chat.title || 'Unknown';
      
      logger.info({ 
        old_chat_id: oldChatId,
        new_chat_id: newChatId,
        chat_title: chatTitle,
        event: 'CHAT_MIGRATION_STARTED'
      }, '🔄 [MIGRATION] Group migrated to supergroup - starting migration');
      
      try {
        // Проверяем, есть ли org привязки для старой группы
        const { data: orgBindings } = await supabaseServiceRole
          .from('org_telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', String(oldChatId));
        
        const hasOrgBindings = orgBindings && orgBindings.length > 0;
        
        if (hasOrgBindings) {
          logger.info({
            old_chat_id: oldChatId,
            new_chat_id: newChatId,
            chat_title: chatTitle,
            org_ids: orgBindings.map(b => b.org_id),
            event: 'CHAT_MIGRATION_HAS_ORG_BINDINGS'
          }, '🔄 [MIGRATION] Group has organization bindings that will be migrated');
        }
        
        // Сначала создаем запись для новой группы, если её нет
        const { data: existingNew } = await supabaseServiceRole
          .from('telegram_groups')
          .select('id, title, bot_status')
          .eq('tg_chat_id', String(newChatId))
          .maybeSingle();
        
        if (!existingNew) {
          // Получаем данные старой группы
          const { data: oldGroup } = await supabaseServiceRole
            .from('telegram_groups')
            .select('title, bot_status, member_count')
            .eq('tg_chat_id', String(oldChatId))
            .maybeSingle();
          
          if (oldGroup) {
            logger.info({
              old_chat_id: oldChatId,
              new_chat_id: newChatId,
              chat_title: oldGroup.title,
              bot_status: oldGroup.bot_status,
              member_count: oldGroup.member_count,
              event: 'CHAT_MIGRATION_CREATING_NEW_GROUP'
            }, '🔄 [MIGRATION] Creating new group record from old data');
            
            await supabaseServiceRole
              .from('telegram_groups')
              .insert({
                tg_chat_id: String(newChatId),
                title: oldGroup.title,
                bot_status: oldGroup.bot_status,
                member_count: oldGroup.member_count,
                // invite_link removed in migration 071
                migrated_from: String(oldChatId),
                last_sync_at: new Date().toISOString()
              });
          } else {
            logger.warn({
              old_chat_id: oldChatId,
              new_chat_id: newChatId,
              event: 'CHAT_MIGRATION_OLD_GROUP_NOT_FOUND'
            }, '⚠️ [MIGRATION] Old group not found in database - creating minimal record');
            
            await supabaseServiceRole
              .from('telegram_groups')
              .insert({
                tg_chat_id: String(newChatId),
                title: chatTitle,
                bot_status: 'connected',
                migrated_from: String(oldChatId),
                last_sync_at: new Date().toISOString()
              });
          }
        } else {
          logger.info({
            old_chat_id: oldChatId,
            new_chat_id: newChatId,
            existing_title: existingNew.title,
            existing_bot_status: existingNew.bot_status,
            event: 'CHAT_MIGRATION_TARGET_EXISTS'
          }, '🔄 [MIGRATION] Target group already exists');
        }
        
        // Вызываем функцию миграции
        const { data: result, error } = await supabaseServiceRole
          .rpc('migrate_telegram_chat_id', {
            old_chat_id: oldChatId,
            new_chat_id: newChatId
          });
        
        if (error) {
          logger.error({ 
            old_chat_id: oldChatId,
            new_chat_id: newChatId,
            chat_title: chatTitle,
            error: error.message,
            error_code: (error as any).code,
            event: 'CHAT_MIGRATION_RPC_ERROR'
          }, '❌ [MIGRATION] Migration RPC error');
        } else {
          logger.info({ 
            old_chat_id: oldChatId,
            new_chat_id: newChatId,
            chat_title: chatTitle,
            result,
            event: 'CHAT_MIGRATION_COMPLETED'
          }, '✅ [MIGRATION] Group migration completed successfully');
          
          // Записываем миграцию в лог
          await supabaseServiceRole
            .from('telegram_chat_migrations')
            .upsert({
              old_chat_id: oldChatId,
              new_chat_id: newChatId,
              migration_result: result
            }, { onConflict: 'old_chat_id,new_chat_id' });
        }
      } catch (migrationError) {
        logger.error({ 
          old_chat_id: oldChatId,
          new_chat_id: newChatId,
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        }, 'Migration exception');
      }
    }
    
    // Также обрабатываем migrate_from_chat_id (когда новая группа получает сообщение)
    if (body.message?.migrate_from_chat_id) {
      const newChatId = body.message.chat.id;
      const oldChatId = body.message.migrate_from_chat_id;
      const chatTitle = body.message.chat.title || 'Unknown';
      
      logger.info({ 
        old_chat_id: oldChatId,
        new_chat_id: newChatId,
        chat_title: chatTitle,
        event: 'CHAT_MIGRATION_FROM_RECEIVED'
      }, '🔄 [MIGRATION] Received migrate_from_chat_id - ensuring migration is complete');
      
      // Проверяем, была ли уже выполнена миграция
      const { data: migration } = await supabaseServiceRole
        .from('telegram_chat_migrations')
        .select('id, migrated_at')
        .eq('old_chat_id', oldChatId)
        .eq('new_chat_id', newChatId)
        .maybeSingle();
      
      if (!migration) {
        logger.info({
          old_chat_id: oldChatId,
          new_chat_id: newChatId,
          chat_title: chatTitle,
          event: 'CHAT_MIGRATION_DELAYED_START'
        }, '🔄 [MIGRATION] Migration not found - executing delayed migration');
        
        // Миграция еще не выполнена - выполняем
        try {
          const { data: result, error } = await supabaseServiceRole
            .rpc('migrate_telegram_chat_id', {
              old_chat_id: oldChatId,
              new_chat_id: newChatId
            });
          
          if (error) {
            logger.error({ 
              old_chat_id: oldChatId,
              new_chat_id: newChatId,
              chat_title: chatTitle,
              error: error.message,
              error_code: (error as any).code,
              event: 'CHAT_MIGRATION_DELAYED_ERROR'
            }, '❌ [MIGRATION] Delayed migration RPC error');
          } else {
            logger.info({ 
              old_chat_id: oldChatId,
              new_chat_id: newChatId,
              chat_title: chatTitle,
              result,
              event: 'CHAT_MIGRATION_DELAYED_COMPLETED'
            }, '✅ [MIGRATION] Delayed migration completed');
            
            await supabaseServiceRole
              .from('telegram_chat_migrations')
              .upsert({
                old_chat_id: oldChatId,
                new_chat_id: newChatId,
                migration_result: result
              }, { onConflict: 'old_chat_id,new_chat_id' });
          }
        } catch (err) {
          logger.error({ 
            error: err instanceof Error ? err.message : String(err)
          }, 'Delayed migration exception');
        }
      }
    }
    
    // ========================================
    // STEP 2.8: Обработка реакций (message_reaction)
    // ========================================
    if (body.message_reaction) {
      const reaction = body.message_reaction;
      const chatId = reaction.chat?.id;
      const chatType = reaction.chat?.type;
      const messageId = reaction.message_id;
      const userId = reaction.user?.id;
      
      logger.debug({ 
        chat_id: chatId,
        chat_type: chatType,
        message_id: messageId,
        user_id: userId
      }, 'Processing reaction');
      
      // Handle channel reactions separately
      if (chatType === 'channel') {
        logger.debug({
          webhook: 'main',
          chat_id: chatId,
          message_id: messageId,
          user_id: userId,
          new_reaction: reaction.new_reaction,
          old_reaction: reaction.old_reaction
        }, '❤️ [WEBHOOK] Received channel reaction');
        
        const result = await processChannelReaction(body.message_reaction);
        if (!result.success) {
          logger.error({ 
            error: result.error, 
            chat_id: chatId,
            message_id: messageId
          }, '❌ [WEBHOOK] Failed to process channel reaction');
        }
      } else if (chatId && messageId && userId) {
        // Group reactions
        const { data: orgBindings } = await supabaseServiceRole
          .from('org_telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', chatId);
        
        if (orgBindings && orgBindings.length > 0) {
          const eventProcessingService = createEventProcessingService();
          eventProcessingService.setSupabaseClient(supabaseServiceRole);
          await eventProcessingService.processReaction(body.message_reaction, orgBindings[0].org_id);
          
          if (userId) {
            updateParticipantActivity(userId, orgBindings[0].org_id).catch(() => {});
          }
        }
      }
    }
    
    // ========================================
    // STEP 2.8.1: Обработка агрегированных реакций (message_reaction_count)
    // ========================================
    if (body.message_reaction_count) {
      const reactionCount = body.message_reaction_count;
      const chatId = reactionCount.chat?.id;
      const chatType = reactionCount.chat?.type;
      const messageId = reactionCount.message_id;
      
      logger.debug({
        webhook: 'main',
        chat_id: chatId,
        chat_type: chatType,
        message_id: messageId,
        reactions: reactionCount.reactions
      }, '📊 [WEBHOOK] Received message_reaction_count');
      
      // Handle only for channels
      if (chatType === 'channel') {
        try {
          // Update post reactions count in database
          // Telegram API sends r.total_count, not r.count
          const totalReactions = reactionCount.reactions?.reduce((sum: number, r: any) => sum + (r.total_count || 0), 0) || 0;
          
          logger.debug({ 
            chat_id: chatId,
            message_id: messageId,
            reactions_array: reactionCount.reactions,
            calculated_total: totalReactions
          }, '🔢 [WEBHOOK] Calculating reactions count');
          
          const { error: updateError } = await supabaseServiceRole
            .rpc('update_post_reactions_count', {
              p_channel_tg_id: chatId,
              p_message_id: messageId,
              p_reactions_count: totalReactions
            });
          
          if (updateError) {
            logger.error({ 
              error: updateError, 
              chat_id: chatId,
              message_id: messageId
            }, '❌ [WEBHOOK] Failed to update post reactions count');
          } else {
            logger.debug({ 
              chat_id: chatId,
              message_id: messageId,
              total_reactions: totalReactions
            }, '✅ [WEBHOOK] Post reactions count updated');
          }
        } catch (error) {
          logger.error({ 
            error, 
            chat_id: chatId,
            message_id: messageId
          }, '❌ [WEBHOOK] Error processing message_reaction_count');
        }
      }
    }
    
    // ========================================
    // STEP 2.9: Обработка постов каналов (channel_post)
    // ========================================
    if (body.channel_post) {
      logger.debug({
        webhook: 'main',
        update_id: body.update_id,
        chat_id: body.channel_post.chat?.id,
        chat_type: body.channel_post.chat?.type,
        chat_title: body.channel_post.chat?.title,
        message_id: body.channel_post.message_id,
        has_text: !!body.channel_post.text,
        text_length: body.channel_post.text?.length || 0
      }, '📢 [WEBHOOK] Received channel_post');
      
      const result = await processChannelPost(body.channel_post);
      if (!result.success) {
        logger.error({ 
          error: result.error, 
          chat_id: body.channel_post.chat?.id 
        }, '❌ [WEBHOOK] Failed to process channel_post');
      }
    }
    
    // ========================================
    // STEP 2.10: Обновление статистики постов (edited_channel_post)
    // ========================================
    if (body.edited_channel_post) {
      logger.debug({
        webhook: 'main',
        update_id: body.update_id,
        chat_id: body.edited_channel_post.chat?.id,
        message_id: body.edited_channel_post.message_id,
        views: body.edited_channel_post.views
      }, '📝 [WEBHOOK] Received edited_channel_post');
      
      const result = await processEditedChannelPost(body.edited_channel_post);
      if (!result.success) {
        logger.error({ 
          error: result.error, 
          chat_id: body.edited_channel_post.chat?.id 
        }, '❌ [WEBHOOK] Failed to process edited_channel_post');
      }
    }
    
    // Обработка команд бота и кодов авторизации
    if (body?.message?.text) {
      const text = body.message.text.trim();
      const chatType = body.message.chat?.type;
      const isAuthCode = /^[0-9A-F]{6}$/i.test(text);
      
      if (isAuthCode && chatType === 'private') {
        // Коды авторизации обрабатываем ТОЛЬКО в личных сообщениях
        logger.info({ code: text }, 'Auth code detected in DM');
        await handleAuthCode(body.message, text.toUpperCase(), logger);
      } else if (isAuthCode && chatType !== 'private') {
        // В группах игнорируем сообщения, похожие на коды
        logger.debug({ code: text, chat_type: chatType, chat_id: body.message.chat?.id }, 'Ignoring auth-code-like message in group chat');
      } else if (text.startsWith('/')) {
        const command = text.split(' ')[0];
        logger.debug({ command }, 'Bot command received');
        await handleBotCommand(body.message, logger);
      }
    } else {
      logger.debug({ 
        update_type: body.my_chat_member ? 'my_chat_member' : body.chat_member ? 'chat_member' : 'other'
      }, 'Non-text update');
    }
    
    // Итоговый лог (debug уровень - слишком частые)
    const durationMs = Date.now() - startTime;
    logger.debug({ 
      update_id: updateId,
      event_type: body.message?.chat?.type || 'event',
      duration_ms: durationMs,
      chat_id: chatId,
      org_id: orgId
    }, 'Webhook processing completed');
    
    // ========================================
    // RECORD SUCCESSFUL PROCESSING
    // ========================================
    
    // Extract chat_id for logging
    chatId = body.message?.chat?.id || body.my_chat_member?.chat?.id || body.chat_member?.chat?.id || null;
    
    // Get event type
    let eventType = 'unknown';
    if (body.message) eventType = 'message';
    else if (body.my_chat_member) eventType = 'my_chat_member';
    else if (body.chat_member) eventType = 'chat_member';
    
    // Record idempotency
    if (updateId && chatId) {
      if (USE_OPTIMIZED_PROCESSING) {
        await recordWebhookProcessed(updateId, chatId, eventType, orgId);
      } else {
        await supabaseServiceRole
          .from('telegram_webhook_idempotency')
          .insert({
            update_id: updateId,
            tg_chat_id: chatId,
            event_type: eventType,
            org_id: orgId
          });
      }
      
      // Log health success (silent)
      await supabaseServiceRole
        .rpc('log_telegram_health', {
          p_tg_chat_id: chatId,
          p_event_type: 'webhook_success',
          p_status: 'healthy',
          p_message: `Processed ${eventType} update`,
          p_org_id: orgId
        });
    }
    
  } catch (error) {
    // Extract chat_id for error logging
    chatId = chatId || body.message?.chat?.id || body.my_chat_member?.chat?.id || body.chat_member?.chat?.id || null;
    
    logger.error({ 
      update_id: updateId,
      chat_id: chatId,
      org_id: orgId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Webhook processing error');
    
    // ========================================
    // LOG ERROR TO DATABASE
    // ========================================
    
    // Log error to database
    const { error: logError } = await supabaseServiceRole
      .rpc('log_error', {
        p_level: 'error',
        p_message: error instanceof Error ? error.message : String(error),
        p_error_code: 'WEBHOOK_PROCESSING_ERROR',
        p_context: JSON.stringify({
          update_id: updateId,
          chat_id: chatId,
          event_type: body.message ? 'message' : body.my_chat_member ? 'my_chat_member' : 'unknown'
        }),
        p_stack_trace: error instanceof Error ? error.stack : null,
        p_org_id: orgId
      });
    
    if (logError) {
      logger.error({ error: logError.message }, 'Failed to log error to database');
    }
    
    // Log health failure
    if (chatId) {
      const { error: healthFailureError } = await supabaseServiceRole
        .rpc('log_telegram_health', {
          p_tg_chat_id: chatId,
          p_event_type: 'webhook_failure',
          p_status: 'unhealthy',
          p_message: error instanceof Error ? error.message : String(error),
          p_org_id: orgId
        });
      
      if (healthFailureError) {
        logger.error({ error: healthFailureError.message }, 'Failed to log health failure');
      }
    }
  }
}

/**
 * Обработка кода авторизации
 */
async function handleAuthCode(message: any, code: string, logger: ReturnType<typeof createAPILogger>) {
  const chatId = message.chat.id;
  const from = message.from;
  const authLogger = logger.child({ service: 'telegram_auth' });
  
  authLogger.info({ 
    code,
    telegram_user_id: from.id,
    chat_id: chatId,
    username: from.username
  }, 'Processing auth code');
  
  try {
    const verifyResult = await verifyTelegramAuthCode({
      code,
      telegramUserId: from.id,
      telegramUsername: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      photoUrl: from.photo_url
    });
    
    authLogger.debug({ result: verifyResult }, 'Auth code verification completed');

    if (verifyResult.success) {
      const telegramService = createTelegramService('main');

      if (verifyResult.alreadyAuthenticated) {
        // Welcome-screen linking flow: the user is already logged in via email/OAuth.
        // No auth link needed — just confirm the connection and tell them to return to the browser.
        await telegramService.sendMessage(chatId,
          '✅ Telegram подключён к Orbo!\n\nВернитесь в браузер — страница обновится автоматически.',
          { parse_mode: 'Markdown' }
        );
        authLogger.info({ telegram_user_id: from.id, code }, 'TG linked to existing user (welcome screen flow)');
      } else {
        // Standard registration flow: send one-time auth link.
        // Permanent org link will be sent after the handler processes it.
        let message = '✅ Код подтверждён!\n\n';
        message += '🔐 Нажмите на ссылку ниже для входа:\n';
        message += `${verifyResult.sessionUrl}\n\n`;
        message += '⏰ _Ссылка действует 1 час и работает только один раз._';
        await telegramService.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        authLogger.info({ telegram_user_id: from.id, code, org_id: verifyResult.orgId }, 'One-time auth link sent');
      }
    } else {
      // Ошибка верификации
      let errorMessage = '❌ Неверный или просроченный код авторизации.'
      
      if (verifyResult.errorCode === 'EXPIRED_CODE') {
        errorMessage = '⏰ Код авторизации истек. Пожалуйста, запросите новый код.'
      } else if (verifyResult.errorCode === 'INVALID_CODE') {
        errorMessage = '❌ Неверный код авторизации. Проверьте код и попробуйте снова.'
      }
      
      authLogger.warn({ 
        code,
        error_code: verifyResult.errorCode,
        error: verifyResult.error
      }, 'Auth code verification failed');
      
      const telegramService = createTelegramService('main');
      await telegramService.sendMessage(chatId, errorMessage);
    }
  } catch (error) {
    authLogger.error({ 
      code,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Exception in handleAuthCode');
    
    try {
      const telegramService = createTelegramService('main');
      await telegramService.sendMessage(
        chatId,
        '⚠️ Произошла ошибка при обработке кода. Попробуйте позже.'
      );
    } catch (sendError) {
      authLogger.error({ error: sendError }, 'Failed to send error message');
    }
  }
}

async function handleBotCommand(message: any, logger: ReturnType<typeof createAPILogger>) {
  const chatId = message.chat.id;
  const from = message.from;
  const text = message.text;
  const command = text.split(' ')[0].toLowerCase();
  const commandLogger = logger.child({ service: 'bot_command' });
  // Используем сервисную роль для обхода RLS
  const supabase = supabaseServiceRole;
  
  // ✅ Обработка авторизации через код: /start CODE
  if (command === '/start' && text.split(' ').length > 1) {
    const code = text.split(' ')[1].trim().toUpperCase();
    
    // Проверяем, похоже ли на код авторизации (6 символов hex)
    if (/^[0-9A-F]{6}$/i.test(code)) {
      await handleAuthCode(message, code, logger);
      return; // Прекращаем обработку команды
    }
  }
  
  // Обработка личных сообщений - инструкция по использованию
  if (message.chat.type === 'private' && (command === '/start' || command === '/help')) {
    const telegramService = createTelegramService('main');
    const userId = from.id;
    
    const instructionMessage = `🤖 <b>Orbo - ваш помощник для Telegram-групп</b>

Для получения доступа к материалам и событиям пришлите мне одноразовый код.

💡 <i>Одноразовый код можно получить на странице события или материала.</i>`;
    
    await telegramService.sendMessage(chatId, instructionMessage, {
      parse_mode: 'HTML'
    });
    
    commandLogger.info({ user_id: userId }, 'Sent instruction message');
    return;
  }
  
  // Для групповых чатов - обработка команд верификации владельца
  if (message.chat.type !== 'private') {
    commandLogger.debug({ chat_id: chatId }, 'Looking for org mapping');
  
    // Ищем организацию через org_telegram_groups
    const { data: orgMapping } = await supabase
      .from('org_telegram_groups')
      .select('org_id')
      .filter('tg_chat_id::text', 'eq', String(chatId))
      .limit(1)
      .maybeSingle();
    
    if (!orgMapping?.org_id) {
      commandLogger.debug({ chat_id: chatId }, 'Command from unmapped group - using default org');
      // Получаем любую организацию
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);
      
      if (orgs && orgs.length > 0) {
        commandLogger.debug({ org_id: orgs[0].id }, 'Using default org for command');
        return await handleCommandWithOrg(chatId, from, command, orgs[0].id, commandLogger);
      }
      return;
    }
    
    commandLogger.debug({ org_id: orgMapping.org_id, chat_id: chatId }, 'Found org for group');
    return await handleCommandWithOrg(chatId, from, command, orgMapping.org_id, commandLogger);
  } // Закрываем условие для групповых чатов
}

async function handleCommandWithOrg(chatId: number, from: any, command: string, orgId: string, logger: ReturnType<typeof createAPILogger>) {
  // Используем сервисную роль для обхода RLS
  const supabase = supabaseServiceRole;
  const telegramService = createTelegramService();
  
  logger.info({ command, chat_id: chatId, org_id: orgId, user_id: from.id }, 'Processing bot command');
  
  // Обрабатываем команды
  switch(command) {
    case '/help':
      await telegramService.sendMessage(chatId, 
        '<b>Доступные команды:</b>\n' +
        '/help - показать эту справку\n' +
        '/stats - показать статистику группы\n' +
        '/events - показать предстоящие события'
      );
      break;
      
    case '/stats':
      await handleStatsCommand(chatId, orgId, logger);
      break;
      
    case '/events':
      await handleEventsCommand(chatId, orgId, logger);
      break;
  }
  
  // Записываем обработанную команду как событие
  await supabase.from('activity_events').insert({
    org_id: orgId,
    event_type: 'service',
    tg_user_id: from.id,
    tg_chat_id: chatId,
    meta: { 
      service_type: 'command',
      command
    }
  });
}

/**
 * Обрабатывает команду /stats
 */
async function handleStatsCommand(chatId: number, orgId: string, logger: ReturnType<typeof createAPILogger>) {
  // Используем сервисную роль для обхода RLS
  const supabase = supabaseServiceRole;
  const telegramService = createTelegramService();
  
  try {
    // Получаем статистику группы
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    
    logger.debug({ chat_id: chatId, org_id: orgId, today, yesterday }, 'Getting stats');
    
    // Получаем группу для проверки
    let { data: groupData } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('tg_chat_id', chatId)
      .maybeSingle();
      
    if (!groupData) {
      // Пробуем найти как строку
      const { data: groupStrData } = await supabase
        .from('telegram_groups')
        .select('id, title, tg_chat_id')
        .eq('tg_chat_id', String(chatId))
        .maybeSingle();
        
      if (groupStrData) {
        logger.debug({ chat_id: chatId, method: 'string' }, 'Found group with string tg_chat_id');
        groupData = groupStrData;
      } else {
        // Пробуем через filter
        const { data: groupFilterData } = await supabase
          .from('telegram_groups')
          .select('id, title, tg_chat_id')
          .filter('tg_chat_id::text', 'eq', String(chatId))
          .maybeSingle();
        
        if (groupFilterData) {
          logger.debug({ chat_id: chatId, method: 'filter' }, 'Found group with filter');
          groupData = groupFilterData;
        }
      }
    }
    
    // Получаем метрики за сегодня
    const { data: todayMetrics, error: todayError } = await supabase
      .from('group_metrics')
      .select('*')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('date', today)
      .maybeSingle();
    
    if (todayError) {
      logger.error({ error: todayError.message }, 'Error fetching today metrics');
    }
    
    // Если не нашли с числовым chatId, пробуем со строковым
    if (!todayMetrics) {
      const { data: todayMetricsStr } = await supabase
        .from('group_metrics')
        .select('*')
        .eq('org_id', orgId)
        .eq('tg_chat_id', String(chatId))
        .eq('date', today)
        .maybeSingle();
        
      if (todayMetricsStr) {
        logger.debug({ chat_id: chatId }, 'Found today metrics with string tg_chat_id');
      }
    }
    
    // Получаем метрики за вчера
    const { data: yesterdayMetrics, error: yesterdayError } = await supabase
      .from('group_metrics')
      .select('*')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('date', yesterday)
      .maybeSingle();
    
    if (yesterdayError) {
      logger.error({ error: yesterdayError.message }, 'Error fetching yesterday metrics');
    }
    
    // Получаем количество участников
    const { count: memberCount, error: memberCountError } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .limit(1);
    
    if (memberCountError) {
      logger.error({ error: memberCountError.message }, 'Error fetching member count');
    }
    
    // Получаем количество сообщений за все время
    const { count: totalMessages, error: totalMessagesError } = await supabase
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('event_type', 'message');
    
    if (totalMessagesError) {
      logger.error({ error: totalMessagesError.message }, 'Error fetching total messages');
    }
    
    // Формируем сообщение со статистикой
    let statsMessage = `<b>Статистика группы:</b>\n\n`
    
    statsMessage += `👥 <b>Участников:</b> ${memberCount || 0}\n`
    statsMessage += `💬 <b>Всего сообщений:</b> ${totalMessages || 0}\n\n`
    
    if (todayMetrics) {
      statsMessage += `<b>Сегодня:</b>\n`
      statsMessage += `• Активных пользователей: ${todayMetrics.dau || 0}\n`
      statsMessage += `• Сообщений: ${todayMetrics.message_count || 0}\n`
      statsMessage += `• Коэффициент ответов: ${todayMetrics.reply_ratio || 0}%\n`
      
      if (todayMetrics.join_count > 0 || todayMetrics.leave_count > 0) {
        statsMessage += `• Новых участников: +${todayMetrics.join_count || 0}\n`
        statsMessage += `• Ушло участников: -${todayMetrics.leave_count || 0}\n`
        statsMessage += `• Изменение: ${todayMetrics.net_member_change > 0 ? '+' : ''}${todayMetrics.net_member_change || 0}\n`
      }
    }
    
    if (yesterdayMetrics) {
      statsMessage += `\n<b>Вчера:</b>\n`
      statsMessage += `• Активных пользователей: ${yesterdayMetrics.dau || 0}\n`
      statsMessage += `• Сообщений: ${yesterdayMetrics.message_count || 0}\n`
      
      if (yesterdayMetrics.join_count > 0 || yesterdayMetrics.leave_count > 0) {
        statsMessage += `• Изменение участников: ${yesterdayMetrics.net_member_change > 0 ? '+' : ''}${yesterdayMetrics.net_member_change || 0}\n`
      }
    }
    
    await telegramService.sendMessage(chatId, statsMessage)
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error handling stats command');
    await telegramService.sendMessage(chatId, 'Ошибка при получении статистики.')
  }
}

/**
 * Обрабатывает команду /events
 */
async function handleEventsCommand(chatId: number, orgId: string, logger: ReturnType<typeof createAPILogger>) {
  // Используем сервисную роль для обхода RLS
  const supabase = supabaseServiceRole;
  const telegramService = createTelegramService();
  
  try {
    // Получаем предстоящие события
      const { data: events } = await supabase
        .from('events')
        .select('id, title, starts_at, location')
        .eq('org_id', orgId)
        .gt('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(5)
      
      if (events && events.length > 0) {
        const eventsList = events.map((e: any) => {
          const date = new Date(e.starts_at).toLocaleDateString('ru', {
            day: 'numeric', 
            month: 'long',
            hour: '2-digit', 
            minute: '2-digit'
          })
        const location = e.location ? ` (${e.location})` : ''
        return `• <b>${e.title}</b> - ${date}${location}`
      }).join('\n')
      
      await telegramService.sendMessage(chatId, 
        `<b>Предстоящие события:</b>\n\n${eventsList}`
      )
    } else {
      await telegramService.sendMessage(chatId, 
        'Нет предстоящих событий.'
      )
    }
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error handling events command');
    await telegramService.sendMessage(chatId, 'Ошибка при получении событий.')
  }
}
