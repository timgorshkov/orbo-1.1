import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    const groupId = searchParams.get('groupId');
    const chatId = searchParams.get('chatId');

    if (!orgId || !chatId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    console.log('Analytics API request for:', { orgId, groupId, chatId });

    // Инициализируем Supabase с сервисной ролью для обхода RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем базовые метрики
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // Получаем метрики из activity_events
    const { data: activityEvents, error: activityError } = await supabase
      .from('activity_events')
      .select('id, event_type, created_at, tg_user_id, meta, reply_to_message_id')
      .eq('tg_chat_id', chatId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);

    console.log('Activity events query result:', {
      count: activityEvents?.length || 0,
      error: activityError
    });

    // Если нет данных, возвращаем пустые метрики
    if (!activityEvents || activityEvents.length === 0) {
      return NextResponse.json({
        metrics: {
          message_count: 0,
          reply_count: 0,
          join_count: 0,
          leave_count: 0,
          dau_avg: 0,
          reply_ratio_avg: 0,
          days: 0,
          silent_rate: 0,
          newcomer_activation: 0,
          activity_gini: 0,
          prime_time: [],
          risk_radar: []
        },
        topUsers: [],
        dailyMetrics: []
      });
    }

    // Рассчитываем метрики на основе данных activity_events
    let messageCount = 0;
    let replyCount = 0;
    let joinCount = 0;
    let leaveCount = 0;
    const usersByDay: Record<string, Set<string>> = {};
    const participantActivity: Record<string, { count: number; username: string | null; full_name: string | null; tg_user_id?: number }> = {};
    const dailyMetrics: Record<string, any> = {};
    const eventLastActivityMap = new Map<string, string>();

    activityEvents.forEach((event) => {
      const day = new Date(event.created_at).toISOString().split('T')[0];
      
      // Инициализируем метрики для дня, если еще нет
      if (!dailyMetrics[day]) {
        dailyMetrics[day] = {
          date: day,
          message_count: 0,
          reply_count: 0,
          join_count: 0,
          leave_count: 0,
          dau: 0
        };
      }
      
      // Инициализируем множество пользователей для дня, если еще нет
      if (!usersByDay[day]) {
        usersByDay[day] = new Set();
      }

      // Обрабатываем событие в зависимости от типа
      if (event.event_type === 'message') {
        messageCount++;
        dailyMetrics[day].message_count++;
        
        if (event.reply_to_message_id) {
          replyCount++;
          dailyMetrics[day].reply_count++;
        }
        
        // Добавляем пользователя в статистику активности
        const userId = event.tg_user_id?.toString();
        if (userId) {
          const numericUserId = event.tg_user_id;
          usersByDay[day].add(userId);
          eventLastActivityMap.set(userId, event.created_at);
          
          // Обновляем статистику активности пользователя
          if (!participantActivity[userId]) {
            let username = null;
            if (event.meta?.user?.username) {
              username = event.meta.user.username;
            } else if (event.meta?.from?.username) {
              username = event.meta.from.username;
            } else if (event.meta?.username) {
              username = event.meta.username;
            }

            let fullName = null;
            if (event.meta?.user?.name) {
              fullName = event.meta.user.name;
            } else if (event.meta?.from?.name) {
              fullName = event.meta.from.name;
            } else if (event.meta?.first_name) {
              fullName = event.meta.first_name + (event.meta.last_name ? ' ' + event.meta.last_name : '');
            }

            participantActivity[userId] = {
              count: 0,
              username,
              full_name: fullName,
              tg_user_id: numericUserId ?? undefined
            };
          }
          participantActivity[userId].count++;
        }
      } else if (event.event_type === 'join') {
        joinCount++;
        dailyMetrics[day].join_count++;
      } else if (event.event_type === 'leave') {
        leaveCount++;
        dailyMetrics[day].leave_count++;
      }
    });

    // Обновляем DAU для каждого дня
    Object.keys(dailyMetrics).forEach(day => {
      dailyMetrics[day].dau = usersByDay[day]?.size || 0;
    });

    // Рассчитываем средний DAU
    const days = Object.keys(usersByDay).length || 1;
    let totalActiveUsers = 0;
    
    Object.values(usersByDay).forEach(users => {
      totalActiveUsers += users.size;
    });
    
    const avgDau = Math.max(1, Math.round(totalActiveUsers / days));

    // Рассчитываем коэффициент ответов
    const replyRatio = messageCount > 0 ? Math.round((replyCount / messageCount) * 100) : 0;

    // Получаем информацию о группе для расчета Silent Rate
    const { data: groupData, error: groupError } = await supabase
      .from('telegram_groups')
      .select('member_count')
      .eq('id', groupId)
      .single();

    const memberCount = groupData?.member_count || 0;
    
    // Рассчитываем Silent Rate
    const activeUsers = Object.values(participantActivity).length;
    const silentRate = memberCount > 0 ? Math.round(((memberCount - activeUsers) / memberCount) * 100) : 0;

    // Рассчитываем Newcomer Activation
    // Для простоты считаем, что все пользователи в списке активных - это новички
    const newcomerActivation = 100; // Заглушка, нужны дополнительные данные для точного расчета

    // Рассчитываем Prime Time
    const hourlyActivity: Record<number, number> = {};
    
    activityEvents.forEach(event => {
      if (event.event_type === 'message') {
        const hour = new Date(event.created_at).getHours();
        hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
      }
    });
    
    // Находим среднее количество сообщений в час
    const hourValues = Object.values(hourlyActivity);
    const avgHourlyMessages = hourValues.length > 0 
      ? hourValues.reduce((sum, val) => sum + val, 0) / hourValues.length 
      : 0;
    
    // Формируем Prime Time
    const primeTime = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      message_count: hourlyActivity[hour] || 0,
      is_prime_time: (hourlyActivity[hour] || 0) > avgHourlyMessages
    }));

    // Рассчитываем Gini коэффициент активности
    // Упрощенный расчет - отношение стандартного отклонения к среднему
    const userMessageCounts = Object.values(participantActivity).map(u => u.count);
    
    let activityGini = 0;
    if (userMessageCounts.length > 1) {
      const mean = userMessageCounts.reduce((sum, count) => sum + count, 0) / userMessageCounts.length;
      const variance = userMessageCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / userMessageCounts.length;
      const stdDev = Math.sqrt(variance);
      activityGini = mean > 0 ? stdDev / mean : 0;
      // Нормализуем до 0-1
      activityGini = Math.min(1, activityGini);
    }

    // Формируем топ активных пользователей
    const topUsers = Object.entries(participantActivity)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([userId, data]) => ({
        tg_user_id: Number(userId),
        full_name: data.full_name,
        username: data.username,
        message_count: data.count,
        display_name: data.full_name || (data.username ? `@${data.username}` : null) || `ID ${userId}`,
        last_activity: eventLastActivityMap.get(userId) || new Date().toISOString()
      }));

    // Формируем дневные метрики для отображения
    const dailyMetricsArray = Object.values(dailyMetrics).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Формируем Risk Radar (упрощенно - пользователи с наименьшей активностью)
    const riskRadar = Object.entries(participantActivity)
      .sort((a, b) => a[1].count - b[1].count)
      .slice(0, 5)
      .map(([userId, data]) => ({
        tg_user_id: parseInt(userId),
        username: data.username,
        full_name: data.full_name,
        display_name: data.full_name || (data.username ? `@${data.username}` : null) || `ID ${userId}`,
        risk_score: Math.round(
          80 -
            (data.count /
              Math.max(1, Math.max(...userMessageCounts))) *
              50
        ),
        last_activity: eventLastActivityMap.get(userId) || new Date().toISOString(),
        message_count: data.count
      }));

    const missingUserIds: number[] = [];
    Object.entries(participantActivity).forEach(([userId, data]) => {
      if (!data.username) {
        const numericId = Number(userId);
        if (Number.isFinite(numericId)) {
          missingUserIds.push(numericId);
        }
      }
    });

    if (missingUserIds.length > 0) {
      try {
        const { data: participantUsernameRows, error: participantUsernameError } = await supabase
          .from('participants')
          .select('tg_user_id, username, full_name')
          .eq('org_id', orgId)
          .in('tg_user_id', missingUserIds);

        if (participantUsernameError) {
          console.error('Error fetching participant usernames for analytics:', participantUsernameError);
        } else if (participantUsernameRows) {
          participantUsernameRows.forEach(row => {
            if (!row?.tg_user_id) {
              return;
            }
            const key = row.tg_user_id.toString();
            if (!participantActivity[key]) {
              participantActivity[key] = {
                count: 0,
                username: row.username ?? null,
                full_name: row.full_name ?? null,
                tg_user_id: row.tg_user_id ?? undefined
              };
            } else {
              if (!participantActivity[key].username && row.username) {
                participantActivity[key].username = row.username;
              }
              if (!participantActivity[key].full_name && row.full_name) {
                participantActivity[key].full_name = row.full_name;
              }
              if (!participantActivity[key].tg_user_id && row.tg_user_id) {
                participantActivity[key].tg_user_id = row.tg_user_id;
              }
            }
          });
        }
      } catch (participantUsernameException) {
        console.error('Exception fetching participant usernames for analytics:', participantUsernameException);
      }
    }

    if (missingUserIds.length > 0) {
      try {
        const { data: identityRows, error: identityError } = await supabase
          .from('telegram_identities')
          .select('tg_user_id, username, first_name, last_name, full_name')
          .in('tg_user_id', missingUserIds);

        if (identityError) {
          console.error('Error loading telegram identities for analytics:', identityError);
        } else if (identityRows) {
          identityRows.forEach(row => {
            if (!row?.tg_user_id) {
              return;
            }
            const key = row.tg_user_id.toString();
            if (!participantActivity[key]) {
              participantActivity[key] = {
                count: 0,
                username: row?.username ?? null,
                full_name:
                  row?.full_name || [row?.first_name, row?.last_name].filter(Boolean).join(' ') || null,
                tg_user_id: row?.tg_user_id ?? undefined
              };
            } else {
              if (!participantActivity[key].username && row?.username) {
                participantActivity[key].username = row.username;
              }
              if (!participantActivity[key].full_name) {
                participantActivity[key].full_name =
                  row?.full_name || [row?.first_name, row?.last_name].filter(Boolean).join(' ') || null;
              }
              if (!participantActivity[key].tg_user_id && row?.tg_user_id) {
                participantActivity[key].tg_user_id = row.tg_user_id;
              }
            }
          });
        }
      } catch (identitiesException) {
        console.error('Exception while loading telegram identities for analytics:', identitiesException);
      }
    }

    return NextResponse.json({
      metrics: {
        message_count: messageCount,
        reply_count: replyCount,
        join_count: joinCount,
        leave_count: leaveCount,
        dau_avg: avgDau,
        reply_ratio_avg: replyRatio,
        days,
        silent_rate: silentRate,
        newcomer_activation: newcomerActivation,
        activity_gini: activityGini,
        prime_time: primeTime,
        risk_radar: riskRadar
      },
      topUsers,
      dailyMetrics: dailyMetricsArray
    });

  } catch (error: any) {
    console.error('Error in analytics API:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
