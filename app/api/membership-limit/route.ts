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

    groups = (groupsResult.data || []).map((g: any) => ({
      tg_chat_id: g.tg_chat_id,
      title: g.telegram_groups?.title || g.tg_chat_id,
      platform: g.telegram_groups?.platform || 'telegram',
    }))

    channels = (channelsResult.data || []).map((c: any) => ({
      id: c.telegram_channels?.id || c.channel_id,
      title: c.telegram_channels?.title || c.channel_id,
      tg_chat_id: c.telegram_channels?.tg_chat_id || '',
    }))

    maxGroups = (maxGroupsResult.data || []).map((g: any) => ({
      max_chat_id: g.max_chat_id,
      title: g.max_groups?.title || g.max_chat_id,
    }))
  }

  return NextResponse.json({
    ...limitInfo,
    ...(includeResources ? { groups, channels, maxGroups } : {}),
  })
}
