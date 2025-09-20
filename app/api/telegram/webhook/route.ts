import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { createEventProcessingService } from '@/lib/services/eventProcessingService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Проверяем секретный токен
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET!
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const body = await req.json()
    
    console.log('Webhook received:', JSON.stringify(body));
    // Выведем все группы для диагностики
    const supabaseDebug = createClientServer();

    try {
      const { count: testCount, error: testError } = await supabaseDebug
        .from('telegram_groups')
        .select('*', { count: 'exact', head: true });
    
      console.log('Test query count:', testCount, 'Error:', testError);
      
      console.log('Test query result:', testCount, 'Error:', testError);
    } catch (testErr) {
      console.error('Test query failed:', testErr);
    }
    
    const { data: allGroups } = await supabaseDebug
      .from('telegram_groups')
      .select('id, org_id, tg_chat_id, title')
      .limit(10);

    console.log('All groups in database:', allGroups);
    console.log('Incoming chat ID:', body.message?.chat?.id, 'Type:', typeof body.message?.chat?.id);

    // Создаем экземпляр сервиса обработки событий
    const eventProcessingService = createEventProcessingService()
    
    // Обрабатываем обновление
    await eventProcessingService.processUpdate(body)

    // Проверяем, существует ли группа в базе данных
    if (body.message?.chat?.id) {
      const chatId = body.message.chat.id;
      console.log('Chat ID type:', typeof chatId, 'Value:', chatId);

      const title = body.message.chat.title || `Group ${chatId}`;
      const supabase = createClientServer();
      
      // Получаем список организаций
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);
      
      if (orgs && orgs.length > 0) {
        let orgId = orgs[0].id;
        
        // Вставляем группу, игнорируя ошибки уникальности
        console.log(`Inserting group ${title} (${chatId}) for org ${orgId}`);
        try {
          // Сначала проверяем, существует ли группа
          const { data: existingGroup } = await supabase
            .from('telegram_groups')
            .select('id, org_id')
            .filter('tg_chat_id::text', 'eq', String(chatId))
            .limit(1);
          
          console.log('Existing group check result:', existingGroup);
          
          if (existingGroup && existingGroup.length > 0) {
            console.log('Group already exists, updating:', existingGroup[0]);
            // Обновляем существующую группу
            await supabase
              .from('telegram_groups')
              .update({
                title: title,
                bot_status: 'connected',
                analytics_enabled: true,
                last_sync_at: new Date().toISOString()
              })
              .eq('id', existingGroup[0].id);
              
            // Используем ID организации из существующей группы
            orgId = existingGroup[0].org_id;
          } else {
            // Вставляем новую группу
            const { data: insertResult, error: insertError } = await supabase
            .from('telegram_groups')
            .insert({
              org_id: orgId,
              tg_chat_id: String(chatId), // Преобразуем в строку
              title: title,
              bot_status: 'connected',
              analytics_enabled: true,
              last_sync_at: new Date().toISOString()
            })
            .select(); // Добавляем .select() для получения результата
            
            if (insertError) {
              console.error('Insert error:', insertError);
            } else {
              console.log('Successfully inserted group');
            }
          }
          
          // Теперь обрабатываем сообщение напрямую
          if (body.message.from && !body.message.from.is_bot) {
            const { error: activityError } = await supabase.from('activity_events').insert({
              org_id: orgId,
              event_type: 'message',
              tg_user_id: body.message.from.id,
              tg_chat_id: chatId,
              message_id: body.message.message_id,
              chars_count: body.message.text?.length || 0,
              meta: {
                user: {
                  username: body.message.from.username,
                  name: `${body.message.from.first_name} ${body.message.from.last_name || ''}`.trim()
                }
              }
            });
            
            if (activityError) {
              console.error('Error recording message:', activityError);
            } else {
              console.log('Message directly recorded in activity_events');
            }
          }
        } catch (error) {
          console.error('Error processing group:', error);
        }
      }
    }
      
    
    // Обработка команд бота
    if (body?.message?.text?.startsWith('/')) {
      await handleBotCommand(body.message)
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error);
    // Всегда возвращаем успешный ответ Telegram, чтобы избежать повторных запросов
    return NextResponse.json({ ok: true, error: 'Error handled gracefully' });
  }
}

async function handleBotCommand(message: any) {
  const chatId = message.chat.id;
  const from = message.from;
  const text = message.text;
  const command = text.split(' ')[0].toLowerCase();
  const supabase = createClientServer();
  
  // Находим организацию по чату
  const { data: group } = await supabase
    .from('telegram_groups')
    .select('org_id')
    .eq('tg_chat_id', chatId)
    .maybeSingle();
  
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
}

async function handleCommandWithOrg(chatId: number, from: any, command: string, orgId: string) {
  const supabase = createClientServer();
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
  const supabase = createClientServer()
  const telegramService = createTelegramService()
  
  try {
    // Получаем статистику группы
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    
    // Получаем метрики за сегодня
    const { data: todayMetrics } = await supabase
      .from('group_metrics')
      .select('*')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('date', today)
      .single()
    
    // Получаем метрики за вчера
    const { data: yesterdayMetrics } = await supabase
      .from('group_metrics')
      .select('*')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('date', yesterday)
      .single()
    
    // Получаем количество участников
    const { count: memberCount } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
    
    // Получаем количество сообщений за все время
    const { count: totalMessages } = await supabase
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatId)
      .eq('event_type', 'message')
    
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
  const supabase = createClientServer()
  const telegramService = createTelegramService()
  
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
      const eventsList = events.map(e => {
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
