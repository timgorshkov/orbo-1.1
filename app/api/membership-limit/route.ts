import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { checkMembershipLimit } from '@/lib/services/billingService'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminServer()

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limitInfo = await checkMembershipLimit(orgId)

  const includeResources = url.searchParams.get('resources') === 'true'
  let groups: any[] = []
  let channels: any[] = []
  let maxGroups: any[] = []

  if (includeResources) {
    const [groupsResult, channelsResult, maxGroupsResult] = await Promise.all([
      supabase.raw(
        `SELECT otg.tg_chat_id, tg.title, tg.platform
         FROM org_telegram_groups otg
         LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
         WHERE otg.org_id = $1 AND otg.status = 'active'`,
        [orgId]
      ),
      supabase.raw(
        `SELECT otc.channel_id, tc.id AS channel_table_id, tc.title, tc.tg_chat_id AS channel_tg_chat_id
         FROM org_telegram_channels otc
         LEFT JOIN telegram_channels tc ON tc.id = otc.channel_id
         WHERE otc.org_id = $1`,
        [orgId]
      ),
      supabase.raw(
        `SELECT omg.max_chat_id, mg.title
         FROM org_max_groups omg
         LEFT JOIN max_groups mg ON mg.max_chat_id = omg.max_chat_id
         WHERE omg.org_id = $1`,
        [orgId]
      ),
    ])

    groups = (groupsResult.data as any[] || []).map((g: any) => ({
      tg_chat_id: g.tg_chat_id,
      title: g.title || g.tg_chat_id,
      platform: g.platform || 'telegram',
    }))

    channels = (channelsResult.data as any[] || []).map((c: any) => ({
      id: c.channel_table_id || c.channel_id,
      title: c.title || c.channel_id,
      tg_chat_id: c.channel_tg_chat_id || '',
    }))

    maxGroups = (maxGroupsResult.data as any[] || []).map((g: any) => ({
      max_chat_id: g.max_chat_id,
      title: g.title || g.max_chat_id,
    }))
  }

  return NextResponse.json({
    ...limitInfo,
    ...(includeResources ? { groups, channels, maxGroups } : {}),
  })
}
