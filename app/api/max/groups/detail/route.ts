import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/detail' });

  try {
    const orgId = request.nextUrl.searchParams.get('orgId');
    const chatId = request.nextUrl.searchParams.get('chatId');

    if (!orgId || !chatId) {
      return NextResponse.json({ error: 'orgId and chatId required' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createAdminServer();

    // Check admin access
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess');
    const access = await getEffectiveOrgRole(user.id, orgId);
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maxChatId = BigInt(chatId);

    // Verify group is linked to org
    const { data: link } = await db
      .from('org_max_groups')
      .select('status')
      .eq('org_id', orgId)
      .eq('max_chat_id', String(maxChatId))
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: 'Группа не привязана к организации' }, { status: 404 });
    }

    // Fetch group info
    const { data: group } = await db
      .from('max_groups')
      .select('id, max_chat_id, title, bot_status, member_count, last_sync_at, created_at')
      .eq('max_chat_id', String(maxChatId))
      .maybeSingle();

    if (!group) {
      return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 });
    }

    // ─── Analytics ───────────────────────────────────────────────────────────

    // KPI metrics
    const { data: metricsRows } = await db.raw<any[]>(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'message' AND created_at > now() - INTERVAL '30 days') AS messages_30d,
        COUNT(*) FILTER (WHERE event_type = 'join' AND created_at > now() - INTERVAL '30 days') AS joins_30d,
        COUNT(DISTINCT max_user_id) FILTER (WHERE event_type = 'message' AND created_at > now() - INTERVAL '7 days') AS active_users_7d
      FROM activity_events
      WHERE max_chat_id = $1 AND messenger_type = 'max'
    `, [String(maxChatId)]);

    const kpi = metricsRows?.[0] ?? { messages_30d: 0, joins_30d: 0, active_users_7d: 0 };

    // Daily message activity for last 30 days, all days filled (zeros for gaps)
    const { data: dailyRows } = await db.raw<any[]>(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS message_count
      FROM activity_events
      WHERE max_chat_id = $1
        AND messenger_type = 'max'
        AND event_type = 'message'
        AND created_at > now() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [String(maxChatId)]);

    const activityMap = new Map<string, number>(
      (dailyRows ?? []).map((r: any) => [String(r.date).slice(0, 10), Number(r.message_count)])
    );
    const dailyActivity = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      return { date: key, message_count: activityMap.get(key) ?? 0 };
    });

    // Participants: distinct users who had activity in this chat
    const { data: participantRows } = await db.raw<any[]>(`
      SELECT
        ae.max_user_id,
        MAX(ae.created_at) AS last_activity,
        COUNT(*) FILTER (WHERE ae.event_type = 'message' AND ae.created_at > now() - INTERVAL '30 days') AS messages_30d,
        p.id AS participant_id,
        p.full_name,
        p.max_username
      FROM activity_events ae
      LEFT JOIN participants p
        ON p.org_id = $2
        AND p.max_user_id = ae.max_user_id
        AND p.merged_into IS NULL
      WHERE ae.max_chat_id = $1 AND ae.messenger_type = 'max'
      GROUP BY ae.max_user_id, p.id, p.full_name, p.max_username
      ORDER BY last_activity DESC NULLS LAST
      LIMIT 200
    `, [String(maxChatId), orgId]);

    const participants = (participantRows ?? []).map((r: any) => ({
      max_user_id: Number(r.max_user_id),
      participant_id: r.participant_id ?? null,
      full_name: r.full_name ?? null,
      max_username: r.max_username ?? null,
      last_activity: r.last_activity ?? null,
      messages_30d: Number(r.messages_30d),
    }));

    return NextResponse.json({
      group: {
        ...group,
        link_status: link.status,
      },
      metrics: {
        member_count: group.member_count ?? 0,
        active_users_7d: Number(kpi.active_users_7d),
        messages_30d: Number(kpi.messages_30d),
        joins_30d: Number(kpi.joins_30d),
      },
      dailyActivity,
      participants,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching MAX group detail');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
