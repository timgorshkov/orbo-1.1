import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { checkMembershipLimit } from '@/lib/services/billingService'
import { MembershipPageContent } from '@/components/memberships/membership-page-content'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function MembershipPage({ params }: { params: { org: string } }) {
  const orgId = params.org

  try {
    await requireOrgAccess(orgId, ['owner', 'admin'])
  } catch {
    notFound()
  }

  const limitInfo = await checkMembershipLimit(orgId)

  const supabase = createAdminServer()

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

  const groups = (groupsResult.data as any[] || []).map((g: any) => ({
    tg_chat_id: g.tg_chat_id,
    title: g.title || g.tg_chat_id,
    platform: g.platform || 'telegram',
  }))

  const channels = (channelsResult.data as any[] || []).map((c: any) => ({
    id: c.channel_table_id || c.channel_id,
    title: c.title || c.channel_id,
    tg_chat_id: c.channel_tg_chat_id || '',
  }))

  const maxGroups = (maxGroupsResult.data as any[] || []).map((g: any) => ({
    max_chat_id: g.max_chat_id,
    title: g.title || g.max_chat_id,
  }))

  return (
    <MembershipPageContent
      orgId={orgId}
      groups={groups}
      channels={channels}
      maxGroups={maxGroups}
      limitInfo={{
        canAdd: limitInfo.canAdd,
        currentCount: limitInfo.currentCount,
        freeLimit: limitInfo.freeLimit,
        isClubPlan: limitInfo.isClubPlan,
      }}
    />
  )
}
