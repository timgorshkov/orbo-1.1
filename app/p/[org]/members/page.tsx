import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { Suspense } from 'react'
import MembersTabs from '@/components/members/members-tabs'
import { createServiceLogger } from '@/lib/logger'
import { getPublicPortalAccess } from '@/lib/server/portalAccess'
import { checkMembershipGate } from '@/lib/server/membershipGate'
import Link from 'next/link'

export default async function MembersPage({ params, searchParams }: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { org: orgId } = await params
  const { tab = 'list' } = await searchParams
  const logger = createServiceLogger('MembersPage');

  const adminSupabase = createAdminServer()

  const access = await getPublicPortalAccess(orgId)
  if (!access) {
    redirect(`/p/${orgId}/auth`)
  }

  const role = access.role
  const isAdmin = role === 'owner' || role === 'admin'

  const SYSTEM_TG_IDS = new Set([777000, 136817688, 1087968824])
  const INITIAL_LOAD_LIMIT = 150
  const DEFERRED_THRESHOLD = 100

  let participants: any[] = []
  let totalParticipantCount: number | undefined
  let tagStats: any[] = []
  let invites: any[] = []
  let hasTelegramAccount = false
  let hasConnectedGroups = false

  // ⚡ PHASE 1: Fire all independent queries in parallel right after auth
  // org plan, participant count, and admin-only data don't depend on each other
  type BatchResult = {
    orgPlan: string
    totalCount: number | undefined
    tagStatsData: any[] | null
    invitesRaw: any[] | null
  }

  const batchPromise = (async (): Promise<BatchResult> => {
    const promises: Promise<any>[] = [
      adminSupabase.from('organizations').select('plan').eq('id', orgId).single(),
      adminSupabase
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('participant_status', 'excluded')
        .is('merged_into', null),
    ]

    if (isAdmin) {
      promises.push(
        adminSupabase.rpc('get_tag_stats', { p_org_id: orgId }),
        adminSupabase
          .from('organization_invites')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
      )
    }

    const results = await Promise.all(promises)

    return {
      orgPlan: results[0].data?.plan || 'free',
      totalCount: results[1].count ?? undefined,
      tagStatsData: isAdmin ? (results[2]?.error ? null : results[2]?.data) : null,
      invitesRaw: isAdmin ? (results[3]?.data || []) : null,
    }
  })()

  // ⚡ PHASE 2: Membership gate runs concurrently with the batch for non-admins
  const gatePromise = (!isAdmin && access.userId)
    ? checkMembershipGate({ orgId, userId: access.userId, resourceType: 'member_directory', role })
    : Promise.resolve({ allowed: true } as { allowed: boolean; reason?: string })

  const [batch, gate] = await Promise.all([batchPromise, gatePromise])

  if (!gate.allowed) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Доступ к каталогу участников ограничен</h2>
          <p className="text-gray-500 mb-4">{gate.reason}</p>
          <Link href={`/p/${orgId}/membership`} className="text-blue-600 hover:underline text-sm">
            Подробнее о членстве
          </Link>
        </div>
      </div>
    )
  }

  const orgPlan = batch.orgPlan
  totalParticipantCount = batch.totalCount

  if (isAdmin && batch.tagStatsData) {
    tagStats = batch.tagStatsData
  }

  // ⚡ PHASE 3: Participants + admin side-data (invite uses) in parallel
  const isLargeOrg = (totalParticipantCount ?? 0) > DEFERRED_THRESHOLD

  try {
    if (isLargeOrg) {
      const [fastResult, membershipsResult] = await Promise.all([
        adminSupabase
          .from('participants')
          .select(
            'id, full_name, username, tg_user_id, email, photo_url, bio, ' +
            'participant_status, created_at, last_activity_at, custom_attributes, ' +
            'source, phone, max_username, max_user_id, user_id'
          )
          .eq('org_id', orgId)
          .neq('participant_status', 'excluded')
          .is('merged_into', null)
          .order('last_activity_at', { ascending: false, nullsFirst: true })
          .limit(INITIAL_LOAD_LIMIT),
        adminSupabase
          .from('memberships')
          .select('user_id, role')
          .eq('org_id', orgId)
          .in('role', ['owner', 'admin']),
      ])

      if (fastResult.error) logger.error({ error: fastResult.error.message, org_id: orgId }, 'Error fetching participants (fast path)')

      const roleMap = new Map(membershipsResult.data?.map(m => [m.user_id, m.role]) || [])
      const rawList = (fastResult.data || []).filter(
        (p: any) => !p.tg_user_id || !SYSTEM_TG_IDS.has(Number(p.tg_user_id))
      )

      participants = rawList.map((p: any) => {
        const userRole = p.user_id ? roleMap.get(p.user_id) : undefined
        return {
          ...p,
          tg_username: p.username,
          is_org_owner: userRole === 'owner',
          is_owner: userRole === 'owner',
          is_admin: userRole === 'admin',
          is_group_creator: false,
          tags: [],
          real_join_date: p.created_at,
          real_last_activity: p.last_activity_at,
          activity_score: 0,
        }
      })

      logger.debug({
        participant_count: totalParticipantCount,
        sent_count: participants.length,
        org_id: orgId,
        method: 'fast_initial',
      }, 'Fetched participants via fast path (large org)')
    } else {
      const { data: enrichedParticipants, error: rpcError } = await adminSupabase
        .rpc('get_enriched_participants', {
          p_org_id: orgId,
          p_include_tags: isAdmin
        })

      if (rpcError) {
        logger.warn({ error: rpcError.message }, 'RPC not available, using fallback')
        throw new Error('RPC not available')
      }

      participants = (enrichedParticipants || [])
        .filter((p: any) => !p.tg_user_id || !SYSTEM_TG_IDS.has(Number(p.tg_user_id)))
        .map((p: any) => {
          const lastMsg = p.last_message_at ? new Date(p.last_message_at).getTime() : 0
          const lastAct = p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0
          const latestActivity = lastMsg > lastAct ? p.last_message_at : (p.last_activity_at || p.last_message_at)
          return {
            ...p,
            is_org_owner: p.is_org_owner,
            is_group_creator: p.is_group_creator,
            is_admin: p.is_org_admin || p.is_group_admin,
            is_owner: p.is_org_owner,
            tags: p.tags || [],
            real_join_date: p.first_message_at || p.created_at,
            real_last_activity: latestActivity,
            activity_score: p.activity_score || 0,
            first_message_at: p.first_message_at,
          }
        })

      participants.sort((a: any, b: any) => {
        const aTime = a.real_last_activity ? new Date(a.real_last_activity).getTime() : 0
        const bTime = b.real_last_activity ? new Date(b.real_last_activity).getTime() : 0
        return bTime - aTime
      })

      logger.debug({
        participant_count: participants.length,
        org_id: orgId,
        method: 'enriched_rpc',
      }, 'Fetched participants via RPC (small org)')
    }
  } catch (rpcError) {
    logger.info({ org_id: orgId }, 'Using legacy participant loading')

    const [legacyResult, membershipsResult] = await Promise.all([
      adminSupabase
        .from('participants')
        .select('*')
        .eq('org_id', orgId)
        .neq('participant_status', 'excluded')
        .is('merged_into', null)
        .order('last_activity_at', { ascending: false, nullsFirst: true })
        .limit(INITIAL_LOAD_LIMIT),
      adminSupabase
        .from('memberships')
        .select('user_id, role')
        .eq('org_id', orgId)
        .in('role', ['owner', 'admin']),
    ])

    if (legacyResult.error) {
      logger.error({ error: legacyResult.error.message, org_id: orgId }, 'Error fetching participants')
    }

    const roleMap = new Map(membershipsResult.data?.map(m => [m.user_id, m.role]) || [])
    participants = (legacyResult.data || []).filter(
      (p: any) => !p.tg_user_id || !SYSTEM_TG_IDS.has(Number(p.tg_user_id))
    )

    for (const participant of participants) {
      const userRole = participant.user_id ? roleMap.get(participant.user_id) : undefined
      participant.is_org_owner = userRole === 'owner'
      participant.is_owner = userRole === 'owner'
      participant.is_admin = userRole === 'admin'
      participant.is_group_creator = false
      participant.tags = []
      participant.real_join_date = participant.created_at
      participant.real_last_activity = participant.last_activity_at
    }
  }

  // Empty-state TG checks + invite uses (admin only, parallel where possible)
  if (isAdmin) {
    const emptyState = participants.length === 0 || totalParticipantCount === 0
    const invitesRaw = batch.invitesRaw || []

    const sidePromises: Promise<any>[] = []

    if (emptyState && access.userId) {
      sidePromises.push(
        Promise.all([
          adminSupabase.from('user_telegram_accounts').select('id')
            .eq('user_id', access.userId).eq('org_id', orgId).eq('is_verified', true)
            .limit(1).maybeSingle(),
          adminSupabase.from('org_telegram_groups').select('tg_chat_id')
            .eq('org_id', orgId).limit(1).maybeSingle(),
        ])
      )
    } else {
      sidePromises.push(Promise.resolve(null))
    }

    const inviteIds = invitesRaw.map((i: any) => i.id)
    if (inviteIds.length > 0) {
      sidePromises.push(
        adminSupabase.from('organization_invite_uses').select('invite_id').in('invite_id', inviteIds)
      )
    } else {
      sidePromises.push(Promise.resolve(null))
    }

    const [emptyStateResult, inviteUsesResult] = await Promise.all(sidePromises)

    if (emptyStateResult) {
      hasTelegramAccount = !!emptyStateResult[0]?.data
      hasConnectedGroups = !!emptyStateResult[1]?.data
    }

    const usesMap = new Map<string, number>()
    if (inviteUsesResult?.data) {
      for (const use of inviteUsesResult.data) {
        usesMap.set(use.invite_id, (usesMap.get(use.invite_id) || 0) + 1)
      }
    }
    invites = invitesRaw.map((invite: any) => ({
      ...invite,
      organization_invite_uses: [{ count: usesMap.get(invite.id) || 0 }]
    }))
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Участники</h1>
        </div>

        <Suspense fallback={<div className="text-center py-8">Загрузка...</div>}>
          <MembersTabs
            orgId={orgId}
            initialParticipants={participants || []}
            totalParticipantCount={totalParticipantCount}
            initialInvites={invites}
            availableTags={tagStats}
            role={role as 'owner' | 'admin' | 'member' | 'guest'}
            activeTab={tab}
            orgPlan={orgPlan}
            hasTelegramAccount={hasTelegramAccount}
          />
        </Suspense>
      </div>
    </div>
  )
}

