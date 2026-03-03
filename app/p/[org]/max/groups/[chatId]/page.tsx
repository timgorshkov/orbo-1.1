import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import MaxGroupClient from './max-group-client'

export default async function MaxGroupPage({
  params,
}: {
  params: Promise<{ org: string; chatId: string }>
}) {
  const logger = createServiceLogger('MaxGroupPage')
  const { org: orgId, chatId } = await params

  try {
    const { role } = await requireOrgAccess(orgId)

    if (!['owner', 'admin'].includes(role)) {
      return (
        <div className="p-6">
          <p className="text-gray-500">У вас нет доступа к этой странице.</p>
        </div>
      )
    }

    const db = createAdminServer()

    // Verify group is linked to this org
    const { data: link } = await db
      .from('org_max_groups')
      .select('status')
      .eq('org_id', orgId)
      .eq('max_chat_id', chatId)
      .maybeSingle()

    if (!link) return notFound()

    // Fetch group info
    const { data: group } = await db
      .from('max_groups')
      .select('id, max_chat_id, title, bot_status, member_count, last_sync_at, created_at')
      .eq('max_chat_id', chatId)
      .maybeSingle()

    if (!group) return notFound()

    // KPI metrics
    const { data: metricsRows } = await db.raw<any[]>(
      `SELECT
        COUNT(*) FILTER (WHERE event_type = 'message' AND created_at > now() - INTERVAL '30 days') AS messages_30d,
        COUNT(*) FILTER (WHERE event_type = 'join'    AND created_at > now() - INTERVAL '30 days') AS joins_30d,
        COUNT(DISTINCT max_user_id) FILTER (WHERE event_type = 'message' AND created_at > now() - INTERVAL '7 days') AS active_users_7d
      FROM activity_events
      WHERE max_chat_id = $1 AND messenger_type = 'max'`,
      [chatId],
    )
    const kpi = metricsRows?.[0] ?? { messages_30d: 0, joins_30d: 0, active_users_7d: 0 }

    // Daily message activity — last 30 days, all days filled (zeros for gaps)
    const { data: dailyRows } = await db.raw<any[]>(
      `SELECT
        DATE(created_at) AS date,
        COUNT(*)         AS message_count
      FROM activity_events
      WHERE max_chat_id = $1
        AND messenger_type = 'max'
        AND event_type = 'message'
        AND created_at > now() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date`,
      [chatId],
    )

    // Build a full 30-day array with zeros for days that have no data
    // Normalize date to YYYY-MM-DD (pg may return Date object; String(Date).slice(0,10) would be "Mon Jan 26")
    const toDateKey = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10)
    const activityMap = new Map<string, number>(
      (dailyRows ?? []).map((r: any) => [toDateKey(r.date), Number(r.message_count)])
    )
    const dailyActivity = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      const key = d.toISOString().slice(0, 10)
      return { date: key, message_count: activityMap.get(key) ?? 0 }
    })

    // Participants who had any activity in this chat
    const { data: participantRows } = await db.raw<any[]>(
      `SELECT
        ae.max_user_id,
        MAX(ae.created_at) AS last_activity,
        COUNT(*) FILTER (WHERE ae.event_type = 'message' AND ae.created_at > now() - INTERVAL '30 days') AS messages_30d,
        p.id           AS participant_id,
        p.full_name,
        p.max_username
      FROM activity_events ae
      LEFT JOIN participants p
        ON  p.org_id     = $2
        AND p.max_user_id = ae.max_user_id
        AND p.merged_into IS NULL
      WHERE ae.max_chat_id = $1 AND ae.messenger_type = 'max'
      GROUP BY ae.max_user_id, p.id, p.full_name, p.max_username
      ORDER BY last_activity DESC NULLS LAST
      LIMIT 200`,
      [chatId, orgId],
    )
    const participants = (participantRows ?? []).map((r: any) => ({
      max_user_id: Number(r.max_user_id),
      participant_id: r.participant_id ?? null,
      full_name: r.full_name ?? null,
      max_username: r.max_username ?? null,
      last_activity: r.last_activity ? String(r.last_activity) : null,
      messages_30d: Number(r.messages_30d),
    }))

    const metrics = {
      member_count: group.member_count ?? 0,
      active_users_7d: Number(kpi.active_users_7d),
      messages_30d: Number(kpi.messages_30d),
      joins_30d: Number(kpi.joins_30d),
    }

    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              {group.title || 'MAX группа'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Группа в мессенджере MAX</p>
          </div>
          <Link href={`/p/${orgId}/max`}>
            <Button variant="outline" size="sm">Назад</Button>
          </Link>
        </div>

        <MaxGroupClient
          orgId={orgId}
          group={{ ...group, link_status: link.status }}
          metrics={metrics}
          dailyActivity={dailyActivity}
          participants={participants}
        />
      </div>
    )
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error loading MAX group page')
    return (
      <div className="p-6">
        <p className="text-red-500">Ошибка загрузки страницы</p>
      </div>
    )
  }
}
