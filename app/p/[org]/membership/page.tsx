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
    supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, telegram_groups!inner(title, platform)')
      .eq('org_id', orgId)
      .eq('status', 'active'),
    supabase
      .from('org_telegram_channels')
      .select('channel_id, telegram_channels!inner(id, title, tg_chat_id)')
      .eq('org_id', orgId),
    supabase
      .from('org_max_groups')
      .select('max_chat_id, max_groups!inner(title)')
      .eq('org_id', orgId),
  ])

  const groups = (groupsResult.data || []).map((g: any) => ({
    tg_chat_id: g.tg_chat_id,
    title: g.telegram_groups?.title || g.tg_chat_id,
    platform: g.telegram_groups?.platform || 'telegram',
  }))

  const channels = (channelsResult.data || []).map((c: any) => ({
    id: c.telegram_channels?.id || c.channel_id,
    title: c.telegram_channels?.title || c.channel_id,
    tg_chat_id: c.telegram_channels?.tg_chat_id || '',
  }))

  const maxGroups = (maxGroupsResult.data || []).map((g: any) => ({
    max_chat_id: g.max_chat_id,
    title: g.max_groups?.title || g.max_chat_id,
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
