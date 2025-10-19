import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { getUserRoleInOrg } from '@/lib/auth/getUserRole'
import { Suspense } from 'react'
import MembersTabs from '@/components/members/members-tabs'

export default async function MembersPage({ params, searchParams }: { 
  params: Promise<{ org: string }>
  searchParams: Promise<{ tab?: string }> 
}) {
  const { org: orgId } = await params
  const { tab = 'list' } = await searchParams
  
  const supabase = await createClientServer()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  // Get user role
  const role = await getUserRoleInOrg(user.id, orgId)
  if (role === 'guest') {
    redirect('/orgs')
  }

  const isAdmin = role === 'owner' || role === 'admin'

  // Use admin client to bypass RLS for fetching participants
  const adminSupabase = createAdminServer()
  
  // Fetch participants (excluding 'excluded' status and merged participants)
  const { data: participants, error} = await adminSupabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
    .neq('participant_status', 'excluded')
    .is('merged_into', null) // ✅ Исключаем объединенных участников
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
      // Check if user is owner/admin via memberships
      const participantUserId = participant.user_id
      if (participantUserId) {
        const userRole = roleMap.get(participantUserId)
        if (userRole === 'owner') {
          participant.is_owner = true
          participant.is_admin = false
        } else if (userRole === 'admin') {
          participant.is_owner = false
          participant.is_admin = true
        }
      }

      // Check if user is telegram admin
      const tgUserId = participant.tg_user_id ? parseInt(participant.tg_user_id) : null
      if (tgUserId && adminMap.has(tgUserId)) {
        const adminInfo = adminMap.get(tgUserId)!
        participant.is_owner = participant.is_owner || adminInfo.isOwner
        participant.is_admin = participant.is_admin || adminInfo.isAdmin
        participant.custom_title = participant.custom_title || adminInfo.customTitle
      }
    }
  }

  console.log(`Fetched ${participants?.length || 0} participants for org ${orgId}`)

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
            isAdmin={isAdmin}
            activeTab={tab}
          />
        </Suspense>
      </div>
    </div>
  )
}
