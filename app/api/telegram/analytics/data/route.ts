import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function pickLatestTimestamp(current: string | null | undefined, incoming: string | null | undefined): string | null {
  if (!current) {
    return incoming ?? null;
  }

  if (!incoming) {
    return current ?? null;
  }

  const currentTs = new Date(current).getTime();
  const incomingTs = new Date(incoming).getTime();

  if (Number.isNaN(currentTs)) {
    return Number.isNaN(incomingTs) ? null : incoming;
  }

  if (Number.isNaN(incomingTs)) {
    return current;
  }

  return incomingTs >= currentTs ? incoming : current;
}

function calculateRiskScore(lastActivity: string | null | undefined, fallback?: number | null): number {
  if (!lastActivity) {
    return typeof fallback === 'number' ? fallback : 90;
  }

  const lastTs = new Date(lastActivity).getTime();

  if (Number.isNaN(lastTs)) {
    return typeof fallback === 'number' ? fallback : 90;
  }

  const nowTs = Date.now();
  const diffDays = Math.max(0, Math.floor((nowTs - lastTs) / (1000 * 60 * 60 * 24)));

  if (diffDays <= 3) {
    return 5;
  }

  if (diffDays <= 7) {
    return 15;
  }

  if (diffDays <= 14) {
    return 35;
  }

  if (diffDays <= 30) {
    return 60;
  }

  if (diffDays <= 60) {
    return 80;
  }

  return 95;
}

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
    let { data: activityEvents, error: activityError } = await supabase
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
          risk_radar: [],
          member_count: 0
        },
        topUsers: [],
        dailyMetrics: [],
        participants: []
      });
    }

    const processedMessageIds = new Set<string>();

    // Рассчитываем метрики на основе данных activity_events
    let messageCount = 0;
    let replyCount = 0;
    let joinCount = 0;
    let leaveCount = 0;
    const usersByDay: Record<string, Set<string>> = {};
    const participantActivity: Record<string, {
      count: number;
      username: string | null;
      full_name: string | null;
      tg_user_id?: number;
      last_activity: string | null;
      risk_score?: number | null;
      activity_score?: number | null;
    }> = {};
    const dailyMetrics: Record<string, any> = {};

    const botUserIds = new Set([1087968824]);
    const botUsernames = new Set(['GroupAnonymousBot', 'orbo_community_bot', 'OrboCommunityBot']);

    activityEvents = activityEvents.filter(event => {
      const tgUserId = event.tg_user_id ?? event.meta?.user?.id ?? event.meta?.from?.id;
      const username = event.meta?.user?.username || event.meta?.from?.username;

      if (tgUserId != null && botUserIds.has(tgUserId)) {
        return false;
      }

      if (typeof username === 'string' && botUsernames.has(username)) {
        return false;
      }

      return true;
    });

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
          risk_radar: [],
          member_count: 0
        },
        topUsers: [],
        dailyMetrics: [],
        participants: []
      });
    }

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
        const rawNumericUserId =
          typeof event.tg_user_id === 'number'
            ? event.tg_user_id
            : typeof event.meta?.user?.id === 'number'
              ? event.meta.user.id
              : typeof event.meta?.from?.id === 'number'
                ? event.meta.from.id
                : null;

        const dauKey =
          rawNumericUserId != null
            ? String(rawNumericUserId)
            : event.meta?.user?.username
              ? `username:${event.meta.user.username}`
              : event.meta?.from?.username
                ? `username:${event.meta.from.username}`
                : `anon:${event.created_at}`;

        usersByDay[day].add(dauKey);

        const uniqueMessageKey = `${event.tg_user_id ?? 'user'}:${event.meta?.message_id ?? event.id ?? event.created_at}`;
        if (processedMessageIds.has(uniqueMessageKey)) {
          return;
        }
        processedMessageIds.add(uniqueMessageKey);

        messageCount++;
        dailyMetrics[day].message_count++;
        
        if (event.reply_to_message_id) {
          replyCount++;
          dailyMetrics[day].reply_count++;
        }
        
        if (rawNumericUserId != null) {
          const userKey = rawNumericUserId.toString();
          if (!participantActivity[userKey]) {
            participantActivity[userKey] = {
              count: 0,
              username: null,
              full_name: null,
              tg_user_id: rawNumericUserId,
              last_activity: null
            };
          }

          const metaUsername = event.meta?.user?.username || event.meta?.from?.username || event.meta?.username || null;
          if (metaUsername && !participantActivity[userKey].username) {
            participantActivity[userKey].username = metaUsername;
          }

          let metaFullName: string | null = null;
          if (event.meta?.user?.name) {
            metaFullName = event.meta.user.name;
          } else if (event.meta?.from?.name) {
            metaFullName = event.meta.from.name;
          } else if (event.meta?.first_name) {
            metaFullName = `${event.meta.first_name}${event.meta.last_name ? ` ${event.meta.last_name}` : ''}`;
          }

          if (metaFullName && !participantActivity[userKey].full_name) {
            participantActivity[userKey].full_name = metaFullName;
          }

          participantActivity[userKey].count++;
          participantActivity[userKey].last_activity = pickLatestTimestamp(participantActivity[userKey].last_activity, event.created_at);
        }
      } else if (event.event_type === 'join') {
        joinCount++;
        dailyMetrics[day].join_count++;

        if (event.tg_user_id != null) {
          const userKey = event.tg_user_id.toString();
          if (!participantActivity[userKey]) {
            participantActivity[userKey] = {
              count: 0,
              username: null,
              full_name: null,
              tg_user_id: event.tg_user_id,
              last_activity: null
            };
          }
          participantActivity[userKey].last_activity = pickLatestTimestamp(participantActivity[userKey].last_activity, event.created_at);
        }
      } else if (event.event_type === 'leave') {
        leaveCount++;
        dailyMetrics[day].leave_count++;

        if (event.tg_user_id != null) {
          const userKey = event.tg_user_id.toString();
          if (!participantActivity[userKey]) {
            participantActivity[userKey] = {
              count: 0,
              username: null,
              full_name: null,
              tg_user_id: event.tg_user_id,
              last_activity: null
            };
          }
          participantActivity[userKey].last_activity = pickLatestTimestamp(participantActivity[userKey].last_activity, event.created_at);
        }
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

    // Подсчитываем фактическое количество участников группы без ботов
    let memberCount = 0;
    try {
      const { data: memberRows, error: memberError } = await supabase
        .from('participant_groups')
        .select('participants!inner(tg_user_id, username)')
        .eq('tg_group_id', Number(chatId))
        .eq('is_active', true);

      if (memberError) {
        console.error('Error fetching participant groups for member count:', memberError);
      } else if (memberRows) {
        const seen = new Set<number>();
        memberRows.forEach(row => {
          const participantsRaw = row?.participants;
          const participantRecords = Array.isArray(participantsRaw)
            ? participantsRaw
            : participantsRaw
              ? [participantsRaw]
              : [];

          participantRecords.forEach(participant => {
            if (!participant?.tg_user_id) {
              return;
            }

            if (botUserIds.has(participant.tg_user_id)) {
              return;
            }

            if (participant.username && botUsernames.has(participant.username)) {
              return;
            }

            seen.add(participant.tg_user_id);
          });
        });
        memberCount = seen.size;
      }
    } catch (memberCountException) {
      console.error('Exception while counting members for analytics:', memberCountException);
    }

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
    let topUsers = Object.entries(participantActivity)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([userId, data]) => ({
        tg_user_id: Number(userId),
        full_name: data.full_name,
        username: data.username,
        message_count: data.count,
        last_activity: data.last_activity || new Date().toISOString()
      }));

    const maxMessageCount = Math.max(1, ...Object.values(participantActivity).map(u => u.count));

    let riskRadar = Object.entries(participantActivity)
      .sort((a, b) => a[1].count - b[1].count)
      .slice(0, 5)
      .map(([userId, data]) => ({
        tg_user_id: parseInt(userId, 10),
        username: data.username,
        full_name: data.full_name,
        risk_score: calculateRiskScore(data.last_activity, data.risk_score ?? Math.round(80 - (data.count / maxMessageCount) * 50)),
        last_activity: data.last_activity || new Date().toISOString(),
        message_count: data.count
      }));

    const missingUserIds: number[] = [];
    Object.entries(participantActivity).forEach(([userId, data]) => {
      if (data.tg_user_id == null) {
        const numericId = Number(userId);
        if (Number.isFinite(numericId)) {
          data.tg_user_id = numericId;
        }
      }

      if (!data.username) {
        const numericId = data.tg_user_id ?? Number(userId);
        if (Number.isFinite(numericId)) {
          missingUserIds.push(Number(numericId));
        }
      }
    });

    if (missingUserIds.length > 0) {
      try {
        const { data: participantUsernameRows, error: participantUsernameError } = await supabase
          .from('participants')
          .select('tg_user_id, username, full_name, last_activity_at')
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
                tg_user_id: row.tg_user_id ?? undefined,
                last_activity: null,
                risk_score: null,
                activity_score: null
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
              if (!participantActivity[key].last_activity && row.last_activity_at) {
                participantActivity[key].last_activity = row.last_activity_at;
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
                tg_user_id: row?.tg_user_id ?? undefined,
                last_activity: null,
                risk_score: null,
                activity_score: null
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

    if (topUsers.length === 0 && Object.keys(participantActivity).length > 0) {
      topUsers = Object.entries(participantActivity)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([userId, data]) => ({
          tg_user_id: Number(userId),
          full_name: data.full_name,
          username: data.username,
          message_count: data.count,
          last_activity: data.last_activity || new Date().toISOString()
        }));
    }

    if (riskRadar.length === 0 && Object.keys(participantActivity).length > 0) {
      riskRadar = Object.entries(participantActivity)
        .sort((a, b) => a[1].count - b[1].count)
        .slice(0, 5)
        .map(([userId, data]) => ({
          tg_user_id: parseInt(userId, 10),
          username: data.username,
          full_name: data.full_name,
          risk_score: Math.round(
            80 -
              (data.count /
                Math.max(1, Math.max(...Object.values(participantActivity).map(u => u.count)))) *
                50
          ),
          last_activity: data.last_activity || new Date().toISOString(),
          message_count: data.count
        }));
    }

    const activityUserIds = Array.from(
      new Set(
        Object.entries(participantActivity)
          .map(([userId, data]) => {
            if (data.tg_user_id == null) {
              const numericId = Number(userId);
              if (Number.isFinite(numericId)) {
                data.tg_user_id = numericId;
              }
            }
            return data.tg_user_id ?? Number(userId);
          })
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      )
    );

    if (activityUserIds.length > 0) {
      try {
        const { data: identityEnrichmentRows, error: identityEnrichmentError } = await supabase
          .from('telegram_identities')
          .select('tg_user_id, username, first_name, last_name, full_name')
          .in('tg_user_id', activityUserIds);

        if (identityEnrichmentError) {
          console.error('Error enriching participant identities for analytics:', identityEnrichmentError);
        } else if (identityEnrichmentRows) {
          identityEnrichmentRows.forEach(row => {
            if (!row?.tg_user_id) {
              return;
            }
            const key = row.tg_user_id.toString();
            const existing = participantActivity[key];
            if (!existing) {
              participantActivity[key] = {
                count: 0,
                username: row?.username ?? null,
                full_name: row?.full_name || [row?.first_name, row?.last_name].filter(Boolean).join(' ') || null,
                tg_user_id: row.tg_user_id ?? undefined,
                last_activity: null,
                risk_score: null,
                activity_score: null
              };
              return;
            }

            if (!existing.username && row?.username) {
              existing.username = row.username;
            }

            if (!existing.full_name) {
              existing.full_name = row?.full_name || [row?.first_name, row?.last_name].filter(Boolean).join(' ') || null;
            }

            if (!existing.tg_user_id && row?.tg_user_id) {
              existing.tg_user_id = row.tg_user_id;
            }
          });
        }
      } catch (identityEnrichmentException) {
        console.error('Unexpected error enriching participant identities for analytics:', identityEnrichmentException);
      }
    }

    try {
      const { data: participantRows, error: participantError } = await supabase
        .from('participants')
        .select('tg_user_id, activity_score, risk_score, last_activity_at, username, full_name')
        .eq('org_id', orgId)
        .in('tg_user_id', Object.keys(participantActivity).map(Number));

      if (participantError) {
        console.error('Error loading participant metrics for analytics:', participantError);
      } else if (participantRows) {
        participantRows.forEach(row => {
          if (!row?.tg_user_id) {
            return;
          }

          const userKey = row.tg_user_id.toString();
          const existing = participantActivity[userKey];
          if (!existing) {
            participantActivity[userKey] = {
              count: 0,
              username: row.username ?? null,
              full_name: row.full_name ?? null,
              tg_user_id: row.tg_user_id ?? undefined,
              last_activity: row.last_activity_at ?? null,
              activity_score: row.activity_score ?? null,
              risk_score: row.risk_score ?? null
            };
            return;
          }

          if (!existing.username && row.username) {
            existing.username = row.username;
          }

          if (!existing.full_name && row.full_name) {
            existing.full_name = row.full_name;
          }

          existing.last_activity = pickLatestTimestamp(existing.last_activity, row.last_activity_at ?? null);
          existing.activity_score = row.activity_score ?? existing.activity_score ?? existing.count;
          existing.risk_score = row.risk_score ?? existing.risk_score ?? null;
        });
      }
    } catch (participantMergeException) {
      console.error('Unexpected error merging participant metrics for analytics:', participantMergeException);
    }

    // Формируем расширенную информацию для участников
    const participantList = Object.entries(participantActivity).map(([userId, data]) => ({
      tg_user_id: Number(userId),
      username: data.username,
      full_name: data.full_name,
      message_count: data.count,
      last_activity: data.last_activity,
      risk_score: calculateRiskScore(data.last_activity, data.risk_score ?? null)
    }));

    const dailyMetricsArray = Object.values(dailyMetrics)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

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
        risk_radar: riskRadar,
        member_count: memberCount
      },
      topUsers,
      dailyMetrics: dailyMetricsArray,
      participants: participantList
    });

  } catch (error: any) {
    console.error('Error in analytics API:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}


