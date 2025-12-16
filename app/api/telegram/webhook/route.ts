import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { createTelegramService } from '@/lib/services/telegramService'
import { createEventProcessingService } from '@/lib/services/eventProcessingService'
import { verifyTelegramAuthCode } from '@/lib/services/telegramAuthService'
import { webhookRecoveryService } from '@/lib/services/webhookRecoveryService'
import { updateParticipantActivity, incrementGroupMessageCount } from '@/lib/services/participantStatsService'
import { createAPILogger } from '@/lib/logger'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'

export const dynamic = 'force-dynamic';

// Уровень логирования: 'minimal' | 'normal' | 'verbose'
// minimal - только ошибки и важные события
// normal - основные шаги обработки
// verbose - полная отладка
const LOG_LEVEL = process.env.WEBHOOK_LOG_LEVEL || 'minimal';
const isVerbose = LOG_LEVEL === 'verbose';
const isNormal = LOG_LEVEL === 'normal' || isVerbose;

// Создаем глобальный клиент Supabase с сервисной ролью для обхода RLS
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { webhook: 'main' });
  logger.info('Webhook received');
  
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
    
    // Минимальное логирование для production
    if (isVerbose) {
      console.log('[Webhook] update_id:', body?.update_id, 'msg:', !!body?.message, 'text:', body?.message?.text?.substring(0, 30));
    }
    
    let timeoutId: NodeJS.Timeout | null = null
    let didTimeout = false
    
    const processingPromise = processWebhookInBackground(body).then((result) => {
      // Processing completed - cancel timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      return result
    })
    
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(async () => {
        didTimeout = true
        console.log('[Webhook POST] Timeout reached, returning 200 OK anyway')
        // Log timeout as warning
        await logErrorToDatabase({
          level: 'warn',
          message: 'Webhook processing timeout - returning 200 OK anyway',
          errorCode: 'WEBHOOK_TIMEOUT',
          context: {
            endpoint: '/api/telegram/webhook',
            updateId: body?.update_id,
            chatId: body?.message?.chat?.id || body?.my_chat_member?.chat?.id,
            timeoutMs: 10000
          }
        })
        resolve('timeout')
      }, 10000) // 10 секунд
    })
    
    // Ждем либо завершения обработки, либо timeout
    await Promise.race([processingPromise, timeoutPromise])
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook POST] ❌ Error parsing request:', error);
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
async function processWebhookInBackground(body: any) {
  const updateId = body.update_id;
  let chatId: number | null = null;
  let orgId: string | null = null;
  const startTime = Date.now();
  
  try {
    if (isVerbose) {
      console.log('[Webhook] Processing update:', updateId);
    }
    
    // ========================================
    // STEP 0: IDEMPOTENCY CHECK
    // ========================================
    if (updateId) {
      const { data: exists } = await supabaseServiceRole
        .from('telegram_webhook_idempotency')
        .select('update_id')
        .eq('update_id', updateId)
        .single();
      
      if (exists) {
        if (isNormal) console.log('[Webhook] Duplicate update:', updateId);
        return; // Already processed
      }
    }
    
    if (isVerbose) {
      console.log('[Webhook] Structure:', JSON.stringify({
        msg: !!body.message,
        text: !!body?.message?.text,
        type: body?.message?.chat?.type,
        from: body?.message?.from?.id,
        chat: body?.message?.chat?.id
      }));
    }
    
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
          const { error: insertError } = await supabaseServiceRole
            .from('telegram_groups')
            .insert({
              tg_chat_id: String(chatId),
              title: title,
              bot_status: 'pending',
              last_sync_at: new Date().toISOString()
            });
          
          if (insertError) {
            console.error('[Webhook] Error creating group:', insertError.message);
          } else if (isNormal) {
            console.log('[Webhook] New group created:', chatId);
          }
        }
      } catch (error) {
        console.error('[Webhook] Group processing error:', error);
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
      
      if (orgMapping && orgMapping.length > 0) {
        orgId = orgMapping[0].org_id;
        const eventProcessingService = createEventProcessingService();
        eventProcessingService.setSupabaseClient(supabaseServiceRole);
        await eventProcessingService.processUpdate(body);
        
        // Update participant activity stats (lightweight, no enrichment)
        if (body.message?.from?.id && orgId) {
          updateParticipantActivity(body.message.from.id, orgId).catch(() => {});
          incrementGroupMessageCount(msgChatId).catch(() => {});
        }
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
        
        if (memberChatId && newStatus) {
          let botStatus = 'pending';
          if (newStatus === 'administrator') botStatus = 'connected';
          else if (newStatus === 'left' || newStatus === 'kicked') botStatus = 'inactive';
          
          if (isNormal) console.log('[Webhook] Bot status:', memberChatId, botStatus);
          
          const { error: updateError } = await supabaseServiceRole
            .from('telegram_groups')
            .update({
              bot_status: botStatus,
              last_sync_at: new Date().toISOString()
            })
            .filter('tg_chat_id::text', 'eq', String(chatId));
          
          if (updateError) {
            console.error('[Webhook] Bot status update error:', updateError.message);
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
      
      const wasAdmin = oldStatus === 'administrator' || oldStatus === 'creator';
      const isAdmin = newStatus === 'administrator' || newStatus === 'creator';
      
      if (wasAdmin !== isAdmin) {
        if (isNormal) console.log('[Webhook] Admin change:', userId, adminChatId, wasAdmin, '->', isAdmin);
        
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
              console.error('[Webhook] Admin rights upsert error:', upsertError.message);
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
                console.error('[Webhook] Membership sync error:', syncError.message);
              }
            }
          }
        }
      }
    }
    
    // ========================================
    // STEP 2.7: Обработка реакций (message_reaction)
    // ========================================
    if (body.message_reaction) {
      const reaction = body.message_reaction;
      const chatId = reaction.chat?.id;
      const messageId = reaction.message_id;
      const userId = reaction.user?.id;
      
      if (isVerbose) console.log('[Webhook] Reaction:', chatId, messageId, userId);
      
      // Проверяем, что группа привязана к организации
      if (chatId && messageId && userId) {
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
    
    // Обработка команд бота и кодов авторизации (включая личные сообщения)
    if (body?.message?.text) {
      const text = body.message.text.trim();
      const isAuthCode = /^[0-9A-F]{6}$/i.test(text);
      
      if (isAuthCode) {
        if (isNormal) console.log('[Webhook] Auth code:', text);
        await handleAuthCode(body.message, text.toUpperCase());
      } else if (text.startsWith('/')) {
        if (isVerbose) console.log('[Webhook] Command:', text.split(' ')[0]);
        await handleBotCommand(body.message);
      }
    } else if (isVerbose) {
      console.log('[Webhook] Non-text update:', JSON.stringify(body, null, 2));
    }
    
    // Минимальный итоговый лог
    const durationMs = Date.now() - startTime;
    if (isNormal) {
      console.log(`[Webhook] ✓ ${updateId} ${body.message?.chat?.type || 'event'} ${durationMs}ms`);
    }
    
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
      await supabaseServiceRole
        .from('telegram_webhook_idempotency')
        .insert({
          update_id: updateId,
          tg_chat_id: chatId,
          event_type: eventType,
          org_id: orgId
        });
      
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
    console.error('[Webhook] Error:', error instanceof Error ? error.message : String(error));
    if (isVerbose && error instanceof Error) {
      console.error('[Webhook] Stack:', error.stack);
    }
    
    // ========================================
    // LOG ERROR TO DATABASE
    // ========================================
    
    // Extract chat_id for error logging
    chatId = chatId || body.message?.chat?.id || body.my_chat_member?.chat?.id || body.chat_member?.chat?.id || null;
    
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
      console.error('[Webhook] ⚠️  Failed to log error to database:', logError.message);
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
        console.error('[Webhook] ⚠️  Failed to log health failure:', healthFailureError.message);
      }
    }
  }
}

/**
 * Обработка кода авторизации
 */
async function handleAuthCode(message: any, code: string) {
  const chatId = message.chat.id;
  const from = message.from;
  
  console.log(`[Bot Auth] ==================== START ====================`);
  console.log(`[Bot Auth] Processing auth code: ${code}`);
  console.log(`[Bot Auth] User ID: ${from.id}`);
  console.log(`[Bot Auth] Chat ID: ${chatId}`);
  console.log(`[Bot Auth] Username: ${from.username}`);
  
  try {
    // Вызываем сервис верификации напрямую (без HTTP fetch)
    console.log(`[Bot Auth] Calling verifyTelegramAuthCode service...`);
    
    const verifyResult = await verifyTelegramAuthCode({
      code,
      telegramUserId: from.id,
      telegramUsername: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      photoUrl: from.photo_url
    });
    
    console.log(`[Bot Auth] ✅ Service call completed`);
    console.log(`[Bot Auth] Result:`, JSON.stringify(verifyResult, null, 2));

    if (verifyResult.success) {
      // Успешная авторизация
      const telegramService = createTelegramService('main');
      
      // Формируем сообщение с двумя ссылками
      let message = '✅ Авторизация успешна!\n\n';
      
      if (verifyResult.orgId) {
        // Получаем название организации
        try {
          const { data: org } = await supabaseServiceRole
            .from('organizations')
            .select('name')
            .eq('id', verifyResult.orgId)
            .single();
          
          const orgName = org?.name || 'Ваше пространство';
          const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/p/${verifyResult.orgId}`;
          
          message += `🏠 Вы получили доступ к пространству *${orgName}*\n\n`;
          message += `📱 Постоянная ссылка на пространство:\n${publicUrl}\n\n`;
          message += `🔐 Для первого входа откройте эту авторизационную ссылку:\n${verifyResult.sessionUrl}\n\n`;
          message += `⏰ _Авторизационная ссылка действует 1 час и только для первого входа._\n`;
          message += `_После первого входа используйте постоянную ссылку выше._`;
        } catch (err) {
          console.error('[Bot Auth] Failed to fetch org name:', err);
          message += `Откройте эту ссылку для входа в систему:\n${verifyResult.sessionUrl}\n\n🔒 Ссылка действительна 1 час.`;
        }
      } else {
        message += `Откройте эту ссылку для входа в систему:\n${verifyResult.sessionUrl}\n\n🔒 Ссылка действительна 1 час.`;
      }
      
      await telegramService.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
      
      console.log(`[Bot Auth] ✅ User ${from.id} authenticated successfully with code ${code}`);
      console.log(`[Bot Auth] ==================== SUCCESS ====================`);
    } else {
      // Ошибка верификации
      let errorMessage = '❌ Неверный или просроченный код авторизации.'
      
      if (verifyResult.errorCode === 'EXPIRED_CODE') {
        errorMessage = '⏰ Код авторизации истек. Пожалуйста, запросите новый код.'
      } else if (verifyResult.errorCode === 'INVALID_CODE') {
        errorMessage = '❌ Неверный код авторизации. Проверьте код и попробуйте снова.'
      }
      
      console.log(`[Bot Auth] ❌ Sending error message: ${errorMessage}`);
      const telegramService = createTelegramService('main');
      await telegramService.sendMessage(chatId, errorMessage);
      
      console.log(`[Bot Auth] ❌ Failed to verify code ${code}: ${verifyResult.error}`);
      console.log(`[Bot Auth] ==================== FAILED ====================`);
    }
  } catch (error) {
    console.error(`[Bot Auth] ❌ Exception in handleAuthCode:`, error);
    console.error(`[Bot Auth] Error type:`, error instanceof Error ? error.constructor.name : typeof error);
    console.error(`[Bot Auth] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    try {
      const telegramService = createTelegramService('main');
      await telegramService.sendMessage(
        chatId,
        '⚠️ Произошла ошибка при обработке кода. Попробуйте позже.'
      );
    } catch (sendError) {
      console.error(`[Bot Auth] Failed to send error message:`, sendError);
    }
    
    console.log(`[Bot Auth] ==================== ERROR ====================`);
  }
}

async function handleBotCommand(message: any) {
  const chatId = message.chat.id;
  const from = message.from;
  const text = message.text;
  const command = text.split(' ')[0].toLowerCase();
  // Используем сервисную роль для обхода RLS
  const supabase = supabaseServiceRole;
  
  // ✅ Обработка авторизации через код: /start CODE
  if (command === '/start' && text.split(' ').length > 1) {
    const code = text.split(' ')[1].trim().toUpperCase();
    
    // Проверяем, похоже ли на код авторизации (6 символов hex)
    if (/^[0-9A-F]{6}$/i.test(code)) {
      await handleAuthCode(message, code);
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
    
    console.log(`[Bot] Sent instruction message to user ${userId}`);
    return;
  }
  
  // Для групповых чатов - обработка команд верификации владельца
  if (message.chat.type !== 'private') {
    // Находим организацию по чату через org_telegram_groups (telegram_groups не имеет org_id)
    console.log(`Looking for org mapping for tg_chat_id: ${chatId}`);
  
    // Ищем организацию через org_telegram_groups
    const { data: orgMapping } = await supabase
      .from('org_telegram_groups')
      .select('org_id')
      .filter('tg_chat_id::text', 'eq', String(chatId))
      .limit(1)
      .maybeSingle();
    
    if (!orgMapping?.org_id) {
      console.log(`Command from unmapped group ${chatId}, trying to get any organization`);
      // Получаем любую организацию
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);
      
      if (orgs && orgs.length > 0) {
        console.log(`Using default org ${orgs[0].id} for command`);
        return await handleCommandWithOrg(chatId, from, command, orgs[0].id);
      }
      return;
    }
    
    console.log(`Found org ${orgMapping.org_id} for group ${chatId}`);
    return await handleCommandWithOrg(chatId, from, command, orgMapping.org_id);
  } // Закрываем условие для групповых чатов
}

async function handleCommandWithOrg(chatId: number, from: any, command: string, orgId: string) {
  // Используем сервисную роль для обхода RLS
  const supabase = supabaseServiceRole;
  const telegramService = createTelegramService();
  
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
      await handleStatsCommand(chatId, orgId);
      break;
      
    case '/events':
      await handleEventsCommand(chatId, orgId);
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
async function handleStatsCommand(chatId: number, orgId: string) {
  // Используем сервисную роль для обхода RLS
  const supabase = supabaseServiceRole;
  const telegramService = createTelegramService();
  
  try {
    // Получаем статистику группы
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    
    console.log(`Getting stats for chat ${chatId} in org ${orgId}, today: ${today}, yesterday: ${yesterday}`);
    
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
        console.log(`Found group with string tg_chat_id: ${String(chatId)}`);
        groupData = groupStrData;
      } else {
        // Пробуем через filter
        const { data: groupFilterData } = await supabase
          .from('telegram_groups')
          .select('id, title, tg_chat_id')
          .filter('tg_chat_id::text', 'eq', String(chatId))
          .maybeSingle();
          
        if (groupFilterData) {
          console.log(`Found group with filter tg_chat_id::text = ${String(chatId)}`);
          groupData = groupFilterData;
        }
      }
    }
    
    console.log(`Group data for stats:`, groupData);
    
    // Получаем метрики за сегодня
    const { data: todayMetrics, error: todayError } = await supabase
      .from('group_metrics')
      .select('*')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('date', today)
      .maybeSingle();
      
    if (todayError) {
      console.error('Error fetching today metrics:', todayError);
    }
    
    console.log('Today metrics:', todayMetrics);
    
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
        console.log('Found today metrics with string tg_chat_id');
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
      console.error('Error fetching yesterday metrics:', yesterdayError);
    }
    
    console.log('Yesterday metrics:', yesterdayMetrics);
    
    // Получаем количество участников
    const { count: memberCount, error: memberCountError } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .limit(1);
      
    if (memberCountError) {
      console.error('Error fetching member count:', memberCountError);
    }
    
    // Получаем количество сообщений за все время
    const { count: totalMessages, error: totalMessagesError } = await supabase
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('event_type', 'message');
      
    if (totalMessagesError) {
      console.error('Error fetching total messages:', totalMessagesError);
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
    console.error('Error handling stats command:', error)
    await telegramService.sendMessage(chatId, 'Ошибка при получении статистики.')
  }
}

/**
 * Обрабатывает команду /events
 */
async function handleEventsCommand(chatId: number, orgId: string) {
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
    console.error('Error handling events command:', error)
    await telegramService.sendMessage(chatId, 'Ошибка при получении событий.')
  }
}
