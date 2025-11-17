import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { Suspense } from 'react'
import MembersTabs from '@/components/members/members-tabs'

export default async function MembersPage({ params, searchParams }: { 
  params: Promise<{ org: string }>
  searchParams: Promise<{ tab?: string }> 
}) {
  const { org: orgId } = await params
  const { tab = 'list' } = await searchParams
  
  const supabase = await createClientServer()
  const adminSupabase = createAdminServer()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/p/${orgId}/auth`)
  }

  // Get user role
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

  // Fetch participants (excluding 'excluded' status and merged participants)
  const { data: participants, error} = await adminSupabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
    .neq('participant_status', 'excluded')
    .is('merged_into', null) // Исключаем объединенных участников
    .order('full_name', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('Error fetching participants:', error)
  }

  // Enrich participants with admin information
  if (participants && participants.length > 0) {
    // Get memberships for admin/owner status
    const { data: memberships } = await adminSupabase
      .from('memberships')
      .select('user_id, role')
      .eq('org_id', orgId)
      .in('role', ['owner', 'admin'])

    const roleMap = new Map(memberships?.map(m => [m.user_id, m.role]) || [])

    // Get telegram admin statuses
    const { data: telegramGroups } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)

    const chatIds = telegramGroups?.map(g => g.tg_chat_id) || []
    
    let adminMap = new Map<number, { isOwner: boolean; isAdmin: boolean; customTitle: string | null }>()
    if (chatIds.length > 0) {
      const { data: telegramAdmins } = await adminSupabase
        .from('telegram_group_admins')
        .select('tg_user_id, is_owner, is_admin, custom_title')
        .in('tg_chat_id', chatIds)
        .gt('expires_at', new Date().toISOString())

      if (telegramAdmins) {
        for (const admin of telegramAdmins) {
          const existing = adminMap.get(admin.tg_user_id)
          adminMap.set(admin.tg_user_id, {
            isOwner: (existing?.isOwner || admin.is_owner) || false,
            isAdmin: (existing?.isAdmin || admin.is_admin) || false,
            customTitle: admin.custom_title || existing?.customTitle || null
          })
        }
      }
    }

    // Enrich each participant
    for (const participant of participants) {
      participant.is_org_owner = false // Владелец организации (фиолетовая корона)
      participant.is_group_creator = false // Создатель группы в Telegram (синий бейдж)
      participant.is_admin = false // Администратор
      
      // Check if user is owner/admin via memberships
      const participantUserId = participant.user_id
      if (participantUserId) {
        const userRole = roleMap.get(participantUserId)
        if (userRole === 'owner') {
          participant.is_org_owner = true
        } else if (userRole === 'admin') {
          participant.is_admin = true
        }
      }

      // Check if user is telegram admin or group creator
      const tgUserId = participant.tg_user_id ? parseInt(participant.tg_user_id) : null
      if (tgUserId && adminMap.has(tgUserId)) {
        const adminInfo = adminMap.get(tgUserId)!
        if (adminInfo.isOwner) {
          participant.is_group_creator = true
        }
        if (adminInfo.isAdmin) {
          participant.is_admin = true
        }
        participant.custom_title = participant.custom_title || adminInfo.customTitle
      }
      
      // Для обратной совместимости
      participant.is_owner = participant.is_org_owner
    }
  }

  // Fetch tags for all participants (admin only)
  if (isAdmin && participants && participants.length > 0) {
    const participantIds = participants.map(p => p.id)
    
    // Get all tag assignments for these participants
    const { data: tagAssignments } = await adminSupabase
      .from('participant_tag_assignments')
      .select(`
        participant_id,
        tag:participant_tags(
          id,
          name,
          color
        )
      `)
      .in('participant_id', participantIds)
    
    if (tagAssignments) {
      // Group tags by participant_id
      const tagsByParticipant = new Map<string, any[]>()
      
      for (const assignment of tagAssignments) {
        if (!assignment.tag) continue
        
        const participantId = assignment.participant_id
        if (!tagsByParticipant.has(participantId)) {
          tagsByParticipant.set(participantId, [])
        }
        tagsByParticipant.get(participantId)!.push(assignment.tag)
      }
      
      // Attach tags to each participant
      for (const participant of participants) {
        participant.tags = tagsByParticipant.get(participant.id) || []
      }
    }
  }

  console.log(`[Members Page] Fetched ${participants?.length || 0} participants for org ${orgId}`)

  // Fetch invites if admin
  let invites: any[] = []
  if (isAdmin) {
    const { data: invitesData } = await adminSupabase
      .from('organization_invites')
      .select(`
        *,
        organization_invite_uses(count)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    
    invites = invitesData || []
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Участники</h1>
          <p className="text-gray-600 mt-1">Участники пространства и приглашения</p>
        </div>

        <Suspense fallback={<div className="text-center py-8">Загрузка...</div>}>
          <MembersTabs
            orgId={orgId}
            initialParticipants={participants || []}
            initialInvites={invites}
            role={role as 'owner' | 'admin' | 'member' | 'guest'}
            activeTab={tab}
          />
        </Suspense>
      </div>
    </div>
  )
}

