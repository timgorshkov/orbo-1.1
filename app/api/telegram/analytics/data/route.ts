import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function pickLatestTimestamp(current: string | null | undefined, incoming: string | null | undefined): string | null {
  if (!current) return incoming ?? null
  if (!incoming) return current ?? null

  const currentTs = new Date(current).getTime()
  const incomingTs = new Date(incoming).getTime()

  if (Number.isNaN(currentTs)) {
    return Number.isNaN(incomingTs) ? null : incoming
  }

  if (Number.isNaN(incomingTs)) {
    return current
  }

  return incomingTs >= currentTs ? incoming : current
}

function calculateRiskScore(lastActivity: string | null | undefined, fallback?: number | null): number {
  if (!lastActivity) {
    return typeof fallback === 'number' ? fallback : 90
  }

  const lastTs = new Date(lastActivity).getTime()
  if (Number.isNaN(lastTs)) {
    return typeof fallback === 'number' ? fallback : 90
  }

  const nowTs = Date.now()
  const diffDays = Math.max(0, Math.floor((nowTs - lastTs) / (1000 * 60 * 60 * 24)))

  if (diffDays <= 3) return 5
  if (diffDays <= 7) return 15
  if (diffDays <= 14) return 35
  if (diffDays <= 30) return 60
  if (diffDays <= 60) return 80
  return 95
}

const BOT_USER_IDS = new Set<number>([1087968824])
const BOT_USERNAMES = new Set<string>(['groupanonymousbot', 'orbo_community_bot', 'orbocommunitybot'])

const normalizeUsername = (username?: string | null) => {
  if (!username) return null
  const trimmed = username.trim()
  if (!trimmed) return null
  return trimmed.startsWith('@') ? trimmed.slice(1).toLowerCase() : trimmed.toLowerCase()
}

type ParticipantAggregate = {
  tg_user_id: number
  username: string | null
  full_name: string | null
  message_count: number
  join_count: number
  leave_count: number
  last_activity: string | null
  activity_score: number | null
  risk_score: number | null
  from_membership: boolean
}

type DailyMetrics = {
  date: string
  message_count: number
  reply_count: number
  join_count: number
  leave_count: number
  dau: number
}

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/analytics/data' });
  let orgId: string | null | undefined;
  let chatId: string | null | undefined;
  try {
    const { searchParams } = new URL(request.url)
    orgId = searchParams.get('orgId')
    chatId = searchParams.get('chatId')

    if (!orgId || !chatId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    logger.info({ org_id: orgId, chat_id: chatId }, 'Analytics API request');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const participantsMap = new Map<number, ParticipantAggregate>()
    const usernameToUserId = new Map<string, number>()

    const addOrUpdateParticipant = (
      tgUserId: number | null,
      options: {
        username?: string | null
        fullName?: string | null
        lastActivity?: string | null
        activityScore?: number | null
        riskScore?: number | null
        fromMembership?: boolean
      } = {}
    ): ParticipantAggregate | null => {
      if (tgUserId == null || !Number.isFinite(tgUserId)) {
        return null
      }
      if (BOT_USER_IDS.has(tgUserId)) {
        return null
      }

      const normalized = normalizeUsername(options.username)
      if (normalized && BOT_USERNAMES.has(normalized)) {
        return null
      }

      let record = participantsMap.get(tgUserId)
      if (!record) {
        record = {
          tg_user_id: tgUserId,
          username: null,
          full_name: null,
          message_count: 0,
          join_count: 0,
          leave_count: 0,
          last_activity: null,
          activity_score: null,
          risk_score: null,
          from_membership: false
        }
        participantsMap.set(tgUserId, record)
      }

      if (options.username && !record.username) {
        record.username = options.username
      }
      if (normalized) {
        usernameToUserId.set(normalized, tgUserId)
      }

      if (options.fullName && !record.full_name) {
        record.full_name = options.fullName
      }

      record.last_activity = pickLatestTimestamp(record.last_activity, options.lastActivity ?? null)
      if (options.activityScore != null) {
        record.activity_score = options.activityScore
      }
      if (options.riskScore != null) {
        record.risk_score = options.riskScore
      }
      if (options.fromMembership) {
        record.from_membership = true
      }

      return record
    }

    const resolveUserIdFromUsername = (username?: string | null): number | null => {
      const normalized = normalizeUsername(username)
      if (!normalized) return null
      return usernameToUserId.get(normalized) ?? null
    }

    // 1) Загружаем актуальных участников группы
    try {
      const { data: membershipRows, error: membershipError } = await supabase
        .from('participant_groups')
        .select('participants!inner(tg_user_id, username, full_name, last_activity_at, activity_score, risk_score)')
        .eq('tg_group_id', Number(chatId))
        .eq('is_active', true)

      if (membershipError) {
        logger.error({ error: membershipError.message, chat_id: chatId }, 'Error fetching participant memberships for analytics');
      } else if (membershipRows) {
        membershipRows.forEach(row => {
          const participantsRaw = row?.participants
          const participantRecords = Array.isArray(participantsRaw)
            ? participantsRaw
            : participantsRaw
              ? [participantsRaw]
              : []

          participantRecords.forEach(member => {
            if (!member || member.tg_user_id == null) {
              return
            }

            addOrUpdateParticipant(member.tg_user_id, {
              username: member.username ?? null,
              fullName: member.full_name ?? null,
              lastActivity: member.last_activity_at ?? null,
              activityScore: member.activity_score ?? null,
              riskScore: member.risk_score ?? null,
              fromMembership: true
            })
          })
        })
      }
    } catch (membershipException) {
      logger.error({ 
        error: membershipException instanceof Error ? membershipException.message : String(membershipException),
        stack: membershipException instanceof Error ? membershipException.stack : undefined
      }, 'Unexpected error loading participant memberships for analytics');
    }

    // 2) Загружаем события активности (30 дней)
    const activityWindowDays = 30
    const activityWindowStart = new Date()
    activityWindowStart.setDate(activityWindowStart.getDate() - activityWindowDays)

    const { data: activityEvents, error: activityError } = await supabase
      .from('activity_events')
      .select('id, event_type, created_at, tg_user_id, meta, reply_to_message_id')
      .eq('tg_chat_id', chatId)
      .gte('created_at', activityWindowStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000)

    logger.debug({ 
      events_count: activityEvents?.length || 0,
      error: activityError?.message
    }, 'Activity events query result');

    const processedMessageIds = new Set<string>()
    const usersByDay: Record<string, Set<number>> = {}
    const dailyMetrics: Record<string, DailyMetrics> = {}
    const hourlyActivity: Record<number, number> = {}

    let messageCount = 0
    let replyCount = 0
    let joinCount = 0
    let leaveCount = 0

    if (activityEvents) {
      activityEvents.forEach(event => {
        const metaUsername = event.meta?.user?.username || event.meta?.from?.username || event.meta?.username || null
        const metaFullName =
          event.meta?.user?.name ||
          event.meta?.from?.name ||
          (event.meta?.first_name
            ? `${event.meta.first_name}${event.meta.last_name ? ` ${event.meta.last_name}` : ''}`
            : null)

        let tgUserId = typeof event.tg_user_id === 'number' ? event.tg_user_id : null
        if (tgUserId == null) {
          const metaId =
            typeof event.meta?.user?.id === 'number'
              ? event.meta.user.id
              : typeof event.meta?.from?.id === 'number'
                ? event.meta.from.id
                : null
          if (metaId != null) {
            tgUserId = metaId
          }
        }

        if (tgUserId == null && metaUsername) {
          tgUserId = resolveUserIdFromUsername(metaUsername)
        }

        if (tgUserId == null || BOT_USER_IDS.has(tgUserId)) {
          return
        }

        const record = addOrUpdateParticipant(tgUserId, {
          username: metaUsername ?? null,
          fullName: metaFullName ?? null,
          lastActivity: event.created_at ?? null
        })

        if (!record) {
          return
        }

        const day = new Date(event.created_at ?? Date.now()).toISOString().split('T')[0]

        if (!dailyMetrics[day]) {
          dailyMetrics[day] = {
            date: day,
            message_count: 0,
            reply_count: 0,
            join_count: 0,
            leave_count: 0,
            dau: 0
          }
        }

        if (!usersByDay[day]) {
          usersByDay[day] = new Set()
        }

        if (event.event_type === 'message') {
          const uniqueMessageKey = `${tgUserId}:${event.meta?.message_id ?? event.id ?? event.created_at}`
          if (processedMessageIds.has(uniqueMessageKey)) {
            return
          }
          processedMessageIds.add(uniqueMessageKey)

          messageCount++
          dailyMetrics[day].message_count++

          if (event.reply_to_message_id) {
            replyCount++
            dailyMetrics[day].reply_count++
          }

          record.message_count += 1
          record.last_activity = pickLatestTimestamp(record.last_activity, event.created_at ?? null)
          usersByDay[day].add(tgUserId)

          const hour = new Date(event.created_at ?? Date.now()).getHours()
          hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1
        } else if (event.event_type === 'join') {
          joinCount++
          dailyMetrics[day].join_count++
          record.join_count += 1
          record.last_activity = pickLatestTimestamp(record.last_activity, event.created_at ?? null)
        } else if (event.event_type === 'leave') {
          leaveCount++
          dailyMetrics[day].leave_count++
          record.leave_count += 1
          record.last_activity = pickLatestTimestamp(record.last_activity, event.created_at ?? null)
        }
      })
    }

    const participantList = Array.from(participantsMap.values()).filter(record => !BOT_USER_IDS.has(record.tg_user_id))

    // Получаем все tg_user_id для последующих запросов
    const allTgUserIds = participantList.map(p => p.tg_user_id)
    
    // Выполняем запросы параллельно: обогащение данных, админы, и id/photo
    const [participantsEnrichmentResult, adminDataResult] = await Promise.all([
      // Единый запрос для обогащения участников (включая id, photo_url, username, full_name, scores)
      allTgUserIds.length > 0 
        ? supabase
            .from('participants')
            .select('id, tg_user_id, username, full_name, photo_url, last_activity_at, activity_score, risk_score')
            .eq('org_id', orgId)
            .in('tg_user_id', allTgUserIds)
        : Promise.resolve({ data: null, error: null }),
      
      // Запрос информации об админах
      supabase
        .from('telegram_group_admins')
        .select('tg_user_id, is_owner, is_admin, custom_title')
        .eq('tg_chat_id', parseInt(chatId))
        .gt('expires_at', new Date().toISOString())
    ])

    // Обработка результатов обогащения участников
    const participantIdMap = new Map<number, { id: string; photo_url: string | null }>()
    
    if (participantsEnrichmentResult.error) {
      logger.error({ error: participantsEnrichmentResult.error.message, org_id: orgId }, 'Error fetching participants for analytics enrichment');
    } else if (participantsEnrichmentResult.data) {
      participantsEnrichmentResult.data.forEach(row => {
        if (!row?.tg_user_id) return

        // Сохраняем id и photo_url для последующего использования
        participantIdMap.set(row.tg_user_id, { id: row.id, photo_url: row.photo_url })

        const record = participantsMap.get(row.tg_user_id)
        if (!record) return

        if (row.username && !record.username) {
          record.username = row.username
          const normalized = normalizeUsername(row.username)
          if (normalized) {
            usernameToUserId.set(normalized, record.tg_user_id)
          }
        }

        if (row.full_name && !record.full_name) {
          record.full_name = row.full_name
        }

        record.last_activity = pickLatestTimestamp(record.last_activity, row.last_activity_at ?? null)
        if (row.activity_score != null) {
          record.activity_score = row.activity_score
        }
        if (row.risk_score != null) {
          record.risk_score = row.risk_score
        }
      })
    }

    // Обработка результатов запроса админов
    const adminMap = new Map<number, { isOwner: boolean; isAdmin: boolean; customTitle: string | null }>()
    if (adminDataResult.data) {
      for (const admin of adminDataResult.data) {
        adminMap.set(admin.tg_user_id, {
          isOwner: admin.is_owner || false,
          isAdmin: admin.is_admin || false,
          customTitle: admin.custom_title || null
        })
      }
    }

    const membersTotal = participantList.length

    const activeThreshold = new Date()
    activeThreshold.setDate(activeThreshold.getDate() - 7)

    const membersActive = participantList.filter(record => {
      if (record.message_count > 0) return true
      if (!record.last_activity) return false
      return new Date(record.last_activity).getTime() >= activeThreshold.getTime()
    }).length

    const silentRate = membersTotal > 0 ? Math.round(((membersTotal - membersActive) / membersTotal) * 100) : 0

    const totalDays = Object.keys(usersByDay).length
    const totalActiveUsers = Object.values(usersByDay).reduce((sum, set) => sum + set.size, 0)
    const avgDau = totalDays > 0 ? Math.round(totalActiveUsers / totalDays) : 0

    const replyRatio = messageCount > 0 ? Math.round((replyCount / messageCount) * 100) : 0

    const hourValues = Object.values(hourlyActivity)
    const avgHourlyMessages = hourValues.length > 0 ? hourValues.reduce((sum, val) => sum + val, 0) / hourValues.length : 0
    const primeTime = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      message_count: hourlyActivity[hour] || 0,
      is_prime_time: (hourlyActivity[hour] || 0) > avgHourlyMessages
    }))

    const messageCounts = participantList.map(record => record.message_count)
    let activityGini = 0
    if (messageCounts.length > 1) {
      const mean = messageCounts.reduce((sum, value) => sum + value, 0) / messageCounts.length
      if (mean > 0) {
        const variance = messageCounts.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / messageCounts.length
        const stdDev = Math.sqrt(variance)
        activityGini = Math.min(1, stdDev / mean)
      }
    }

    let topUsers = participantList
      .filter(record => record.message_count > 0)
      .sort(
        (a, b) =>
          b.message_count - a.message_count ||
          new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime()
      )
      .slice(0, 5)
      .map(record => ({
        tg_user_id: record.tg_user_id,
        full_name: record.full_name,
        username: record.username,
        message_count: record.message_count,
        last_activity: record.last_activity || new Date().toISOString()
      }))

    if (topUsers.length === 0 && participantList.length > 0) {
      topUsers = participantList
        .slice()
        .sort(
          (a, b) =>
            b.message_count - a.message_count ||
            new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime()
        )
        .slice(0, 5)
        .map(record => ({
          tg_user_id: record.tg_user_id,
          full_name: record.full_name,
          username: record.username,
          message_count: record.message_count,
          last_activity: record.last_activity || new Date().toISOString()
        }))
    }

    const maxMessageCount = Math.max(1, ...participantList.map(record => record.message_count))

    const riskRadar = participantList
      .slice()
      .sort(
        (a, b) =>
          a.message_count - b.message_count ||
          new Date(a.last_activity ?? 0).getTime() - new Date(b.last_activity ?? 0).getTime()
      )
      .slice(0, 5)
      .map(record => ({
        tg_user_id: record.tg_user_id,
        username: record.username,
        full_name: record.full_name,
        risk_score: calculateRiskScore(
          record.last_activity,
          record.risk_score ?? Math.round(80 - (record.message_count / maxMessageCount) * 50)
        ),
        last_activity: record.last_activity || new Date().toISOString(),
        message_count: record.message_count
      }))

    const newcomerActivation = membersTotal > 0 ? Math.round((membersActive / membersTotal) * 100) : 0

    const participantsResponse = participantList
      .slice()
      .sort(
        (a, b) =>
          b.message_count - a.message_count ||
          new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime()
      )
      .map(record => {
        const adminInfo = adminMap.get(record.tg_user_id)
        const participantInfo = participantIdMap.get(record.tg_user_id)
        return {
          tg_user_id: record.tg_user_id,
          participant_id: participantInfo?.id || null,
          username: record.username,
          full_name: record.full_name,
          message_count: record.message_count,
          last_activity: record.last_activity,
          risk_score: calculateRiskScore(record.last_activity, record.risk_score ?? null),
          is_owner: adminInfo?.isOwner || false,
          is_admin: adminInfo?.isAdmin || false,
          custom_title: adminInfo?.customTitle || null,
          photo_url: participantInfo?.photo_url || null
        }
      })

    const dailyMetricsArray = Object.values(dailyMetrics)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)

    return NextResponse.json({
      metrics: {
        message_count: messageCount,
        reply_count: replyCount,
        join_count: joinCount,
        leave_count: leaveCount,
        dau_avg: avgDau,
        reply_ratio_avg: replyRatio,
        days: totalDays,
        silent_rate: silentRate,
        newcomer_activation: newcomerActivation,
        activity_gini: activityGini,
        prime_time: primeTime,
        risk_radar: riskRadar,
        member_count: membersTotal,
        member_active_count: membersActive
      },
      topUsers,
      dailyMetrics: dailyMetricsArray,
      participants: participantsResponse
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId,
      chat_id: chatId
    }, 'Error in analytics API');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}


