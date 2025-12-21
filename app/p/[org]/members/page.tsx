import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { Suspense } from 'react'
import MembersTabs from '@/components/members/members-tabs'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export default async function MembersPage({ params, searchParams }: { 
  params: Promise<{ org: string }>
  searchParams: Promise<{ tab?: string }> 
}) {
  const { org: orgId } = await params
  const { tab = 'list' } = await searchParams
  const logger = createServiceLogger('MembersPage');
  
  const adminSupabase = createAdminServer()

  // Check authentication via unified auth (supports both Supabase and NextAuth)
  const user = await getUnifiedUser()
  if (!user) {
    redirect(`/p/${orgId}/auth`)
  }

  // Get membership for this user (use admin client to bypass RLS)
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership) {
    redirect(`/p/${orgId}`)
  }

  const role = membership.role
  const isAdmin = role === 'owner' || role === 'admin'

  // ⚡ Try optimized RPC function first, fallback to legacy if not exists
  let participants: any[] = []
  let tagStats: any[] = []
  let invites: any[] = []

  try {
    // ⚡ Оптимизированный запрос: ONE query для участников со всеми данными
    const { data: enrichedParticipants, error: rpcError } = await adminSupabase
      .rpc('get_enriched_participants', { 
        p_org_id: orgId, 
        p_include_tags: isAdmin 
      })

    if (rpcError) {
      // RPC function doesn't exist yet - use fallback
      logger.warn({ error: rpcError.message }, 'RPC not available, using fallback');
      throw new Error('RPC not available')
    }

    // Map RPC result to expected format
    participants = (enrichedParticipants || []).map((p: any) => ({
      ...p,
      is_org_owner: p.is_org_owner,
      is_group_creator: p.is_group_creator,
      is_admin: p.is_org_admin || p.is_group_admin,
      is_owner: p.is_org_owner, // backwards compat
      tags: p.tags || [],
      real_join_date: p.first_message_at || p.created_at,
      real_last_activity: p.last_message_at || p.last_activity_at,
      first_message_at: p.first_message_at
    }))

    logger.info({ 
      participant_count: participants.length,
      org_id: orgId,
      method: 'optimized_rpc'
    }, 'Fetched participants via RPC');

  } catch (rpcError) {
    // ⚠️ Fallback: legacy sequential queries
    logger.info({ org_id: orgId }, 'Using legacy participant loading');
    
    const { data: legacyParticipants, error } = await adminSupabase
      .from('participants')
      .select('*')
      .eq('org_id', orgId)
      .neq('participant_status', 'excluded')
      .is('merged_into', null)
      .order('full_name', { ascending: true, nullsFirst: false })

    if (error) {
      logger.error({ error: error.message, org_id: orgId }, 'Error fetching participants');
    }

    participants = legacyParticipants || []

    // Legacy enrichment (simplified - full version was too slow)
    if (participants.length > 0) {
      // Get memberships for admin/owner status
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

  // ⚡ Параллельные запросы для дополнительных данных (только для админов)
  if (isAdmin) {
    const [tagStatsResult, invitesResult] = await Promise.all([
      adminSupabase.rpc('get_tag_stats', { p_org_id: orgId }),
      adminSupabase
        .from('organization_invites')
        .select(`*, organization_invite_uses(count)`)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
    ])

    if (tagStatsResult.error) {
      logger.error({ error: tagStatsResult.error.message }, 'Error fetching tag stats');
    } else {
      tagStats = tagStatsResult.data || []
    }

    invites = invitesResult.data || []
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
            initialInvites={invites}
            availableTags={tagStats}
            role={role as 'owner' | 'admin' | 'member' | 'guest'}
            activeTab={tab}
          />
        </Suspense>
      </div>
    </div>
  )
}

