import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { createTelegramService } from '@/lib/services/telegramService'
import { createEventProcessingService } from '@/lib/services/eventProcessingService'
import { verifyTelegramAuthCode } from '@/lib/services/telegramAuthService'
import { webhookRecoveryService } from '@/lib/services/webhookRecoveryService'

export const dynamic = 'force-dynamic';

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
  console.log('[Main Bot Webhook] ==================== WEBHOOK RECEIVED ====================');
  
  // Проверяем секретный токен
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET!
  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token');
  console.log('[Main Bot Webhook] Secret token check:', { 
    endpoint: '/api/telegram/webhook',
    botType: 'MAIN',
    hasSecret: !!secret, 
    receivedMatches: receivedSecret === secret,
    secretLength: secret?.length,
    receivedSecretLength: receivedSecret?.length
  });
  
  if (receivedSecret !== secret) {
    console.error('[Main Bot Webhook] ❌ Unauthorized - secret token mismatch');
    console.error('[Main Bot Webhook] Endpoint: /api/telegram/webhook (MAIN BOT)');
    console.error('[Main Bot Webhook] Expected secret (TELEGRAM_WEBHOOK_SECRET) length:', secret?.length);
    console.error('[Main Bot Webhook] Received secret length:', receivedSecret?.length);
    console.error('[Main Bot Webhook] This suggests the webhook was set with a different secret');
    
    // 🔧 Автоматическое восстановление webhook
    console.log('[Main Bot Webhook] 🔧 Attempting automatic webhook recovery...');
    webhookRecoveryService.recoverWebhook('main', 'secret_token_mismatch').catch(err => {
      console.error('[Main Bot Webhook] Recovery failed:', err);
    });
    
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const body = await req.json()
    console.log('[Webhook POST] Body parsed, update_id:', body?.update_id);
    console.log('[Webhook POST] Has message:', !!body?.message);
    console.log('[Webhook POST] Has text:', !!body?.message?.text);
    console.log('[Webhook POST] Text preview:', body?.message?.text?.substring(0, 30));
    
    // Запускаем обработку с timeout
    console.log('[Webhook POST] Starting processing with 10s timeout...');
    
    const processingPromise = processWebhookInBackground(body)
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.log('[Webhook POST] Timeout reached, returning 200 OK anyway')
        resolve('timeout')
      }, 10000) // 10 секунд
    })
    
    // Ждем либо завершения обработки, либо timeout
    await Promise.race([processingPromise, timeoutPromise])
    
    console.log('[Webhook POST] Returning 200 OK to Telegram');
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook POST] ❌ Error parsing request:', error);
    // Всегда возвращаем успешный ответ Telegram, чтобы избежать повторных запросов
    return NextResponse.json({ ok: true });
  }
}

/**
 * Обработка webhook в фоне
 * Эта функция выполняется асинхронно после возврата ответа Telegram
 */
async function processWebhookInBackground(body: any) {
  try {
    console.log('[Webhook] ==================== NEW UPDATE ====================');
    console.log('[Webhook] Processing update:', body.update_id);
    console.log('[Webhook] Update structure:', JSON.stringify({
      has_message: !!body.message,
      has_text: !!body?.message?.text,
      message_type: body?.message?.chat?.type,
      from_id: body?.message?.from?.id,
      chat_id: body?.message?.chat?.id,
      text_preview: body?.message?.text?.substring(0, 50)
    }, null, 2));
    
    console.log('[Webhook] Step 1: Checking if group processing needed');
    
    // Проверяем, существует ли группа в базе данных и добавляем, если нет
    // ТОЛЬКО для групповых чатов (не для private)
    if (body.message?.chat?.id && body.message?.chat?.type !== 'private') {
      console.log('[Webhook] Step 1a: Group chat detected, processing group data');
      const chatId = body.message.chat.id;
      const title = body.message.chat.title || `Group ${chatId}`;
      
      try {
        // Проверяем существующую группу
        console.log('[Webhook] Step 1b: Querying existing group');
        const { data: existingGroup } = await supabaseServiceRole
          .from('telegram_groups')
          .select('id, org_id')
          .filter('tg_chat_id::text', 'eq', String(chatId))
          .limit(1);
        
        if (existingGroup && existingGroup.length > 0) {
          // Обновляем существующую группу
          console.log('[Webhook] Step 1c: Updating existing group:', existingGroup[0].id);
          await supabaseServiceRole
            .from('telegram_groups')
            .update({
              title: title,
              bot_status: 'connected',
              analytics_enabled: true,
              last_sync_at: new Date().toISOString()
            })
            .eq('id', existingGroup[0].id);
        } else {
          // Создаём новую группу БЕЗ привязки к организации
          // Группа будет добавлена в организацию вручную через UI
          console.log('[Webhook] Step 1c: Creating new group WITHOUT org_id');
          await supabaseServiceRole
            .from('telegram_groups')
            .insert({
              org_id: null, // ✅ НЕ привязываем к организации автоматически!
              tg_chat_id: String(chatId),
              title: title,
              bot_status: 'connected',
              analytics_enabled: false, // Аналитика будет включена при добавлении в организацию
              last_sync_at: new Date().toISOString()
            });
          console.log('[Webhook] Step 1d: New group created, waiting for manual assignment to organization');
        }
      } catch (error) {
        console.error('[Webhook] Error processing group:', error);
      }
    } else {
      console.log('[Webhook] Step 1a: Skipping group processing (private chat or no chat id)');
    }
    
    console.log('[Webhook] Step 2: Checking if EventProcessingService needed');
    
    // Обрабатываем событие ТОЛЬКО для групп, добавленных в организацию
    if (body.message?.chat?.type !== 'private' && body.message?.chat?.id) {
      const chatId = body.message.chat.id;
      
      // Проверяем, добавлена ли группа в какую-либо организацию
      console.log('[Webhook] Step 2a: Checking if group is assigned to any organization');
      const { data: orgMapping } = await supabaseServiceRole
        .from('org_telegram_groups')
        .select('org_id')
        .filter('tg_chat_id::text', 'eq', String(chatId))
        .limit(1);
      
      if (orgMapping && orgMapping.length > 0) {
        console.log('[Webhook] Step 2b: ✅ Group is assigned to organization, processing events');
        const eventProcessingService = createEventProcessingService();
        eventProcessingService.setSupabaseClient(supabaseServiceRole);
        await eventProcessingService.processUpdate(body);
        console.log('[Webhook] Step 2c: EventProcessingService completed');
      } else {
        console.log('[Webhook] Step 2b: ⏭️  Group is NOT assigned to any organization, skipping event processing');
        console.log('[Webhook] Step 2c: Group will appear in "Available Groups" for admins to add manually');
      }
    } else {
      console.log('[Webhook] Step 2a: Skipping EventProcessingService (private chat)');
    }
    
    console.log('[Webhook] Step 3: Checking for text message processing');
    
    // Обработка команд бота и кодов авторизации (включая личные сообщения)
    if (body?.message?.text) {
      const text = body.message.text.trim();
      console.log('[Webhook] Received text message:', {
        text: text,
        from: body.message.from?.id,
        chat: body.message.chat?.id,
        chatType: body.message.chat?.type
      });
      
      // Проверяем, является ли это кодом авторизации (6 hex символов)
      const isAuthCode = /^[0-9A-F]{6}$/i.test(text);
      console.log('[Webhook] Is auth code?', isAuthCode, 'Pattern test result:', /^[0-9A-F]{6}$/i.test(text));
      
      if (isAuthCode) {
        console.log('[Webhook] ✅ Detected auth code directly:', text);
        await handleAuthCode(body.message, text.toUpperCase());
      } 
      // Или команда с кодом: /start CODE
      else if (text.startsWith('/')) {
        console.log('[Webhook] Detected command:', text.split(' ')[0]);
        await handleBotCommand(body.message);
      } else {
        console.log('[Webhook] Message does not match auth code or command pattern');
      }
    } else {
      console.log('[Webhook] No text message in update');
      console.log('[Webhook] Full update payload:', JSON.stringify(body, null, 2));
    }
    
    console.log('[Webhook] ==================== COMPLETED ====================');
    console.log('[Webhook] Processing completed for update:', body.update_id);
  } catch (error) {
    console.error('[Webhook] ❌ Background processing error:', error);
    console.error('[Webhook] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[Webhook] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Webhook] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.log('[Webhook] ==================== ERROR ====================');
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
      await telegramService.sendMessage(
        chatId,
        `✅ Авторизация успешна!\n\nОткройте эту ссылку для входа в систему:\n${verifyResult.sessionUrl}\n\n🔒 Ссылка действительна 1 час.`
      );
      
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
  
  // Обработка личных сообщений - перенаправляем на notifications bot
  if (message.chat.type === 'private' && (command === '/start' || command === '/help')) {
    const telegramService = createTelegramService('main');
    const userId = from.id;
    
    const redirectMessage = `🤖 <b>Orbo Community Bot</b>

Этот бот используется для работы с Telegram-группами.

Для получения вашего User ID и верификации аккаунта используйте:
👉 @orbo_assistant_bot

<i>Откройте @orbo_assistant_bot и нажмите /start</i>`;
    
    await telegramService.sendMessage(chatId, redirectMessage, {
      parse_mode: 'HTML'
    });
    
    console.log(`[Bot] Redirected user ${userId} to notifications bot`);
    return;
  }
  
  // Для групповых чатов - обработка команд верификации владельца
  if (message.chat.type !== 'private') {
    // Находим организацию по чату (проверяем как строку и как число)
    console.log(`Looking for group with tg_chat_id: ${chatId}, type: ${typeof chatId}`);
  
    // Сначала пробуем точное совпадение
    let { data: group } = await supabase
      .from('telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', chatId)
      .maybeSingle();
      
    // Если не нашли, пробуем как строку
    if (!group) {
      console.log(`Group not found with exact match, trying string conversion...`);
      const { data: groupStr } = await supabase
        .from('telegram_groups')
        .select('org_id')
        .eq('tg_chat_id', String(chatId))
        .maybeSingle();
        
      if (groupStr) {
        console.log(`Found group with string tg_chat_id: ${String(chatId)}`);
        group = groupStr;
      } else {
        console.log(`Group not found with string tg_chat_id either`);
        
        // Пробуем filter с преобразованием типов
        const { data: groupFilter } = await supabase
          .from('telegram_groups')
          .select('org_id')
          .filter('tg_chat_id::text', 'eq', String(chatId))
          .maybeSingle();
          
        if (groupFilter) {
          console.log(`Found group with filter tg_chat_id::text = ${String(chatId)}`);
          group = groupFilter;
        }
      }
    }
    
    if (!group?.org_id) {
      console.log(`Command from unknown group ${chatId}, trying to get any organization`);
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
    
    return await handleCommandWithOrg(chatId, from, command, group.org_id);
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
