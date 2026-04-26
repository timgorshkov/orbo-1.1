import { NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'

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

const BOT_USER_IDS = new Set<number>([
  1087968824,  // Group Anonymous Bot
  777000,      // Telegram Service Notifications
  136817688,   // @Channel_Bot
])
const BOT_USERNAMES = new Set<string>(['groupanonymousbot', 'orbo_community_bot', 'orbocommunitybot', 'channel_bot'])
const BOT_IDS_ARRAY = Array.from(BOT_USER_IDS)

const normalizeUsername = (username?: string | null) => {
  if (!username) return null
  const trimmed = username.trim()
  if (!trimmed) return null
  return trimmed.startsWith('@') ? trimmed.slice(1).toLowerCase() : trimmed.toLowerCase()
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

    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = await getEffectiveOrgRole(user.id, orgId)
    if (!role || !['owner', 'admin'].includes(role.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    logger.info({ org_id: orgId, chat_id: chatId, user_id: user.id }, 'Analytics API request');

    const supabase = createAdminServer()
    const numericChatId = Number(chatId)

    const activityWindowStart = new Date()
    activityWindowStart.setDate(activityWindowStart.getDate() - 30)
    const startIso = activityWindowStart.toISOString()

    // ── Phase 1: Run all independent queries in parallel ──

    type OverallRow = { message_count: string; reply_count: string; join_count: string; leave_count: string }
    type DailyRow = { date: string; message_count: string; reply_count: string; join_count: string; leave_count: string; dau: string }
    type HourlyRow = { hour: string; cnt: string }
    type PerUserRow = { tg_user_id: string; message_count: string; last_activity: string }

    type MemberRow = {
      id: string; tg_user_id: number | string | null; username: string | null;
      full_name: string | null; photo_url: string | null; last_activity_at: string | null;
      activity_score: number | null; risk_score: number | null;
    }

    const loadMembership = async (): Promise<MemberRow[]> => {
      const { data: links, error: linksErr } = await supabase
        .from('participant_groups')
        .select('participant_id')
        .eq('tg_group_id', numericChatId)
        .is('left_at', null)

      if (linksErr || !links?.length) return []

      const pids = links.map((m: any) => m.participant_id)
      const CHUNK = 500
      const all: MemberRow[] = []
      for (let c = 0; c < pids.length; c += CHUNK) {
        const { data } = await supabase
          .from('participants')
          .select('id, tg_user_id, username, full_name, photo_url, last_activity_at, activity_score, risk_score')
          .in('id', pids.slice(c, c + CHUNK))
          .eq('org_id', orgId)
          .is('merged_into', null)
        if (data) all.push(...data)
      }
      return all
    }

    const [members, overallRes, dailyRes, hourlyRes, perUserRes, adminRes] = await Promise.all([
      loadMembership(),

      supabase.raw<OverallRow>(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'message') AS message_count,
           COUNT(*) FILTER (WHERE event_type = 'message' AND reply_to_message_id IS NOT NULL) AS reply_count,
           COUNT(*) FILTER (WHERE event_type = 'join') AS join_count,
           COUNT(*) FILTER (WHERE event_type = 'leave') AS leave_count
         FROM activity_events
         WHERE tg_chat_id = $1 AND created_at >= $2
           AND tg_user_id IS NOT NULL AND tg_user_id != ALL($3)`,
        [numericChatId, startIso, BOT_IDS_ARRAY]
      ),

      supabase.raw<DailyRow>(
        `SELECT
           created_at::date::text AS date,
           COUNT(*) FILTER (WHERE event_type = 'message') AS message_count,
           COUNT(*) FILTER (WHERE event_type = 'message' AND reply_to_message_id IS NOT NULL) AS reply_count,
           COUNT(*) FILTER (WHERE event_type = 'join') AS join_count,
           COUNT(*) FILTER (WHERE event_type = 'leave') AS leave_count,
           COUNT(DISTINCT CASE WHEN event_type = 'message' THEN tg_user_id END) AS dau
         FROM activity_events
         WHERE tg_chat_id = $1 AND created_at >= $2
           AND tg_user_id IS NOT NULL AND tg_user_id != ALL($3)
         GROUP BY 1 ORDER BY 1 DESC`,
        [numericChatId, startIso, BOT_IDS_ARRAY]
      ),

      supabase.raw<HourlyRow>(
        `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS cnt
         FROM activity_events
         WHERE tg_chat_id = $1 AND event_type = 'message' AND created_at >= $2
           AND tg_user_id IS NOT NULL AND tg_user_id != ALL($3)
         GROUP BY 1`,
        [numericChatId, startIso, BOT_IDS_ARRAY]
      ),

      supabase.raw<PerUserRow>(
        `SELECT tg_user_id,
                COUNT(*) FILTER (WHERE event_type = 'message') AS message_count,
                MAX(created_at) AS last_activity
         FROM activity_events
         WHERE tg_chat_id = $1 AND created_at >= $2
           AND tg_user_id IS NOT NULL AND tg_user_id != ALL($3)
         GROUP BY tg_user_id`,
        [numericChatId, startIso, BOT_IDS_ARRAY]
      ),

      supabase
        .from('telegram_group_admins')
        .select('tg_user_id, is_owner, is_admin, custom_title')
        .eq('tg_chat_id', numericChatId)
        .gt('expires_at', new Date().toISOString()),
    ])

    // ── Phase 2: Build participantsMap ──

    // Per-user activity from SQL aggregation (replaces 2000-row fetch + JS loop)
    const userActivityMap = new Map<number, { message_count: number; last_activity: string }>()
    for (const row of (perUserRes.data || [])) {
      const uid = Number(row.tg_user_id)
      if (!Number.isFinite(uid) || BOT_USER_IDS.has(uid)) continue
      userActivityMap.set(uid, {
        message_count: parseInt(row.message_count || '0'),
        last_activity: row.last_activity,
      })
    }

    type ParticipantRecord = {
      tg_user_id: number; username: string | null; full_name: string | null;
      message_count: number; last_activity: string | null;
      activity_score: number | null; risk_score: number | null; from_membership: boolean;
    }
    const participantsMap = new Map<number, ParticipantRecord>()

    const membershipPidData = new Map<string, {
      tg_user_id: number | null; username: string | null; full_name: string | null;
      photo_url: string | null; last_activity_at: string | null;
      activity_score: number | null; risk_score: number | null;
    }>()

    for (const m of members) {
      const tgUid = m.tg_user_id != null ? Number(m.tg_user_id) : null
      if (tgUid == null || !Number.isFinite(tgUid) || BOT_USER_IDS.has(tgUid)) continue
      const norm = normalizeUsername(m.username)
      if (norm && BOT_USERNAMES.has(norm)) continue

      const act = userActivityMap.get(tgUid)
      participantsMap.set(tgUid, {
        tg_user_id: tgUid,
        username: m.username || null,
        full_name: m.full_name || null,
        message_count: act?.message_count || 0,
        last_activity: pickLatestTimestamp(m.last_activity_at, act?.last_activity || null),
        activity_score: m.activity_score ?? null,
        risk_score: m.risk_score ?? null,
        from_membership: true,
      })

      membershipPidData.set(m.id, {
        tg_user_id: tgUid, username: m.username || null, full_name: m.full_name || null,
        photo_url: m.photo_url || null, last_activity_at: m.last_activity_at || null,
        activity_score: m.activity_score ?? null, risk_score: m.risk_score ?? null,
      })
    }

    // Users discovered only through activity (not in participant_groups)
    for (const [uid, act] of userActivityMap) {
      if (participantsMap.has(uid)) continue
      participantsMap.set(uid, {
        tg_user_id: uid, username: null, full_name: null,
        message_count: act.message_count, last_activity: act.last_activity,
        activity_score: null, risk_score: null, from_membership: false,
      })
    }

    const participantList = Array.from(participantsMap.values())
    const allTgUserIds = participantList.map(p => p.tg_user_id)

    logger.debug({
      participants_count: participantList.length,
      from_membership: participantList.filter(p => p.from_membership).length,
      from_activity_only: participantList.filter(p => !p.from_membership).length,
    }, 'Participant list compiled');

    // ── Phase 3: Enrich participants (participant_id, photo, names) ──

    const participantIdMap = new Map<number, { id: string; photo_url: string | null }>()
    if (allTgUserIds.length > 0) {
      const CHUNK = 500
      for (let c = 0; c < allTgUserIds.length; c += CHUNK) {
        const { data: rows, error: enrichErr } = await supabase
          .from('participants')
          .select('id, tg_user_id, username, full_name, photo_url, last_activity_at, activity_score, risk_score')
          .eq('org_id', orgId)
          .in('tg_user_id', allTgUserIds.slice(c, c + CHUNK))

        if (enrichErr) {
          logger.error({ error: enrichErr.message }, 'Enrichment query error');
          continue
        }

        for (const row of (rows || [])) {
          if (!row?.tg_user_id) continue
          const uid = Number(row.tg_user_id)
          if (!Number.isFinite(uid)) continue
          participantIdMap.set(uid, { id: row.id, photo_url: row.photo_url })

          const rec = participantsMap.get(uid)
          if (!rec) continue
          if (row.username && !rec.username) rec.username = row.username
          if (row.full_name && !rec.full_name) rec.full_name = row.full_name
          rec.last_activity = pickLatestTimestamp(rec.last_activity, row.last_activity_at ?? null)
          if (row.activity_score != null) rec.activity_score = row.activity_score
          if (row.risk_score != null) rec.risk_score = row.risk_score
        }
      }
    }

    // ── Phase 4: Compute derived metrics and build response ──

    const ov = overallRes.data?.[0]
    const messageCount = parseInt(ov?.message_count || '0')
    const replyCount = parseInt(ov?.reply_count || '0')
    const joinCount = parseInt(ov?.join_count || '0')
    const leaveCount = parseInt(ov?.leave_count || '0')

    const dailyRows = dailyRes.data || []
    const totalDays = dailyRows.length
    const totalDau = dailyRows.reduce((s, r) => s + parseInt(r.dau || '0'), 0)
    const avgDau = totalDays > 0 ? Math.round(totalDau / totalDays) : 0
    const replyRatio = messageCount > 0 ? Math.round((replyCount / messageCount) * 100) : 0

    // Hourly activity / prime time
    const hourlyActivity: Record<number, number> = {}
    for (const row of (hourlyRes.data || [])) {
      hourlyActivity[parseInt(row.hour)] = parseInt(row.cnt || '0')
    }
    const hourVals = Object.values(hourlyActivity)
    const avgHourly = hourVals.length > 0 ? hourVals.reduce((s, v) => s + v, 0) / hourVals.length : 0
    const primeTime = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      message_count: hourlyActivity[hour] || 0,
      is_prime_time: (hourlyActivity[hour] || 0) > avgHourly,
    }))

    // Admin map
    const adminMap = new Map<number, { isOwner: boolean; isAdmin: boolean; customTitle: string | null }>()
    if (adminRes.data) {
      for (const a of adminRes.data as any[]) {
        adminMap.set(Number(a.tg_user_id), {
          isOwner: a.is_owner || false, isAdmin: a.is_admin || false, customTitle: a.custom_title || null,
        })
      }
    }

    const membersTotal = participantList.length
    const activeThreshold = new Date()
    activeThreshold.setDate(activeThreshold.getDate() - 7)
    const membersActive = participantList.filter(r =>
      r.message_count > 0 || (r.last_activity && new Date(r.last_activity).getTime() >= activeThreshold.getTime())
    ).length
    const silentRate = membersTotal > 0 ? Math.round(((membersTotal - membersActive) / membersTotal) * 100) : 0
    const newcomerActivation = membersTotal > 0 ? Math.round((membersActive / membersTotal) * 100) : 0

    // Activity Gini (coefficient of variation)
    const msgCounts = participantList.map(r => r.message_count)
    let activityGini = 0
    if (msgCounts.length > 1) {
      const mean = msgCounts.reduce((s, v) => s + v, 0) / msgCounts.length
      if (mean > 0) {
        const variance = msgCounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / msgCounts.length
        activityGini = Math.min(1, Math.sqrt(variance) / mean)
      }
    }

    const maxMsgCount = Math.max(1, ...msgCounts)

    // Top users (top 5 by messages)
    let topUsers = participantList
      .filter(r => r.message_count > 0)
      .sort((a, b) => b.message_count - a.message_count || new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime())
      .slice(0, 5)
      .map(r => ({ tg_user_id: r.tg_user_id, full_name: r.full_name, username: r.username, message_count: r.message_count, last_activity: r.last_activity || new Date().toISOString() }))

    if (topUsers.length === 0 && participantList.length > 0) {
      topUsers = participantList.slice()
        .sort((a, b) => b.message_count - a.message_count || new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime())
        .slice(0, 5)
        .map(r => ({ tg_user_id: r.tg_user_id, full_name: r.full_name, username: r.username, message_count: r.message_count, last_activity: r.last_activity || new Date().toISOString() }))
    }

    // Risk radar (bottom 5 by messages)
    const riskRadar = participantList.slice()
      .sort((a, b) => a.message_count - b.message_count || new Date(a.last_activity ?? 0).getTime() - new Date(b.last_activity ?? 0).getTime())
      .slice(0, 5)
      .map(r => ({
        tg_user_id: r.tg_user_id, username: r.username, full_name: r.full_name,
        risk_score: calculateRiskScore(r.last_activity, r.risk_score ?? Math.round(80 - (r.message_count / maxMsgCount) * 50)),
        last_activity: r.last_activity || new Date().toISOString(), message_count: r.message_count,
      }))

    // Participants response
    const participantsResponse = participantList.slice()
      .sort((a, b) => new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime() || b.message_count - a.message_count)
      .map(r => {
        const ai = adminMap.get(r.tg_user_id)
        const pi = participantIdMap.get(r.tg_user_id)
        return {
          tg_user_id: r.tg_user_id, participant_id: pi?.id || null,
          username: r.username, full_name: r.full_name, message_count: r.message_count,
          last_activity: r.last_activity, risk_score: calculateRiskScore(r.last_activity, r.risk_score ?? null),
          is_owner: ai?.isOwner || false, is_admin: ai?.isAdmin || false, custom_title: ai?.customTitle || null,
          photo_url: pi?.photo_url || null,
        }
      })

    // Merge membership-only participants that might be missing from participantsMap
    const includedPids = new Set(participantsResponse.filter(p => p.participant_id).map(p => p.participant_id))
    const includedUids = new Set(participantsResponse.map(p => p.tg_user_id))

    for (const [pid, data] of membershipPidData) {
      if (includedPids.has(pid)) continue
      if (data.tg_user_id && includedUids.has(data.tg_user_id)) {
        const existing = participantsResponse.find(p => p.tg_user_id === data.tg_user_id)
        if (existing && !existing.participant_id) {
          existing.participant_id = pid
          existing.photo_url = existing.photo_url || data.photo_url
        }
        continue
      }
      participantsResponse.push({
        tg_user_id: data.tg_user_id || 0, participant_id: pid,
        username: data.username, full_name: data.full_name, message_count: 0,
        last_activity: data.last_activity_at,
        risk_score: data.risk_score != null ? calculateRiskScore(data.last_activity_at, data.risk_score) : null,
        is_owner: false, is_admin: false, custom_title: null, photo_url: data.photo_url,
      })
    }

    // Daily metrics (last 5 days for the summary block)
    const dailyMetricsArray = dailyRows.slice(0, 5).map(r => ({
      date: r.date,
      message_count: parseInt(r.message_count || '0'),
      reply_count: parseInt(r.reply_count || '0'),
      join_count: parseInt(r.join_count || '0'),
      leave_count: parseInt(r.leave_count || '0'),
      dau: parseInt(r.dau || '0'),
    }))

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
        member_active_count: membersActive,
      },
      topUsers,
      dailyMetrics: dailyMetricsArray,
      participants: participantsResponse,
    })
  } catch (error: any) {
    logger.error({
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId,
      chat_id: chatId,
    }, 'Error in analytics API');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
