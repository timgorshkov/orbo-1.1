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

  // Check membership gate for member directory (skip for participant-session users — they're valid members)
  if (!isAdmin && access.userId) {
    const gate = await checkMembershipGate({
      orgId,
      userId: access.userId,
      resourceType: 'member_directory',
      role,
    })
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
  }

  // Fetch org plan for membership tab visibility
  const { data: orgData } = await adminSupabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single()
  const orgPlan = orgData?.plan || 'free'

  // System Telegram IDs that must never appear in the participants list
  const SYSTEM_TG_IDS = new Set([777000, 136817688, 1087968824])

  // Initial render sends at most INITIAL_LOAD_LIMIT rows to the client.
  // For large orgs we use a fast direct-table query (no joins, no RPC).
  // The client will background-load the fully-enriched list via /api/participants/enriched.
  const INITIAL_LOAD_LIMIT = 150
  const DEFERRED_THRESHOLD = 100 // orgs above this use fast path + client background load
  let participants: any[] = []
  let totalParticipantCount: number | undefined
  let tagStats: any[] = []
  let invites: any[] = []

  try {
    // ⚡ Cheap count so the client knows whether to trigger a background load
    const { count: totalCount } = await adminSupabase
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('participant_status', 'excluded')
      .is('merged_into', null)

    totalParticipantCount = totalCount ?? undefined
    const isLargeOrg = (totalParticipantCount ?? 0) > DEFERRED_THRESHOLD

    if (isLargeOrg) {
      // ⚡ Fast path: simple direct-table query, no joins, no RPC.
      // Client will enrich in background via /api/participants/enriched.
      const { data: fastParticipants, error } = await adminSupabase
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
        .limit(INITIAL_LOAD_LIMIT)

      if (error) logger.error({ error: error.message, org_id: orgId }, 'Error fetching participants (fast path)')

      const rawList = (fastParticipants || []).filter(
        (p: any) => !p.tg_user_id || !SYSTEM_TG_IDS.has(Number(p.tg_user_id))
      )

      // Minimal enrichment: membership roles for admin/owner badges
      const { data: memberships } = await adminSupabase
        .from('memberships')
        .select('user_id, role')
        .eq('org_id', orgId)
        .in('role', ['owner', 'admin'])
      const roleMap = new Map(memberships?.map(m => [m.user_id, m.role]) || [])

      participants = rawList.map((p: any) => {
        const userRole = p.user_id ? roleMap.get(p.user_id) : undefined
        return {
          ...p,
          tg_username: p.username,   // column is 'username' in DB; components expect tg_username
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
      // ⚡ Small org: full enriched RPC — all data in one shot, no background load needed
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
    // ⚠️ Fallback: plain query, capped
    logger.info({ org_id: orgId }, 'Using legacy participant loading')
    
    const { data: legacyParticipants, error } = await adminSupabase
      .from('participants')
      .select('*')
      .eq('org_id', orgId)
      .neq('participant_status', 'excluded')
      .is('merged_into', null)
      .order('last_activity_at', { ascending: false, nullsFirst: true })
      .limit(INITIAL_LOAD_LIMIT)

    if (error) {
      logger.error({ error: error.message, org_id: orgId }, 'Error fetching participants')
    }

    participants = (legacyParticipants || []).filter(
      (p: any) => !p.tg_user_id || !SYSTEM_TG_IDS.has(Number(p.tg_user_id))
    )

    if (participants.length > 0) {
      const { data: memberships } = await adminSupabase
        .from('memberships')
        .select('user_id, role')
        .eq('org_id', orgId)
        .in('role', ['owner', 'admin'])
      const roleMap = new Map(memberships?.map(m => [m.user_id, m.role]) || [])

      for (const participant of participants) {
        participant.is_org_owner = false
        participant.is_group_creator = false
        participant.is_admin = false
        participant.tags = []
        participant.real_join_date = participant.created_at
        participant.real_last_activity = participant.last_activity_at
        if (participant.user_id) {
          const userRole = roleMap.get(participant.user_id)
          if (userRole === 'owner') participant.is_org_owner = true
          else if (userRole === 'admin') participant.is_admin = true
        }
        participant.is_owner = participant.is_org_owner
      }
    }
  }

  // Проверяем Telegram-аккаунт для пустого стейта (только для админов без участников)
  let hasTelegramAccount = false
  let hasConnectedGroups = false
  if (isAdmin && (participants.length === 0 || totalParticipantCount === 0)) {
    const [tgAccountResult, groupsResult] = await Promise.all([
      adminSupabase
        .from('user_telegram_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .eq('is_verified', true)
        .limit(1)
        .maybeSingle(),
      adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId)
        .limit(1)
        .maybeSingle(),
    ])
    hasTelegramAccount = !!tgAccountResult.data
    hasConnectedGroups = !!groupsResult.data
  }

  // ⚡ Параллельные запросы для дополнительных данных (только для админов)
  if (isAdmin) {
    const [tagStatsResult, invitesRawResult] = await Promise.all([
      adminSupabase.rpc('get_tag_stats', { p_org_id: orgId }),
      adminSupabase
        .from('organization_invites')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
    ])

    if (tagStatsResult.error) {
      logger.error({ error: tagStatsResult.error.message }, 'Error fetching tag stats');
    } else {
      tagStats = tagStatsResult.data || []
    }

    // Получаем количество использований для приглашений
    const invitesRaw = invitesRawResult.data || [];
    const inviteIds = invitesRaw.map(i => i.id);
    let usesMap = new Map<string, number>();
    
    if (inviteIds.length > 0) {
      const { data: uses } = await adminSupabase
        .from('organization_invite_uses')
        .select('invite_id')
        .in('invite_id', inviteIds);
      
      for (const use of uses || []) {
        usesMap.set(use.invite_id, (usesMap.get(use.invite_id) || 0) + 1);
      }
    }

    invites = invitesRaw.map(invite => ({
      ...invite,
      organization_invite_uses: [{ count: usesMap.get(invite.id) || 0 }]
    }));
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

