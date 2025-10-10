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
  
  // Fetch participants (excluding 'excluded' status)
  const { data: participants, error } = await adminSupabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
    .neq('participant_status', 'excluded')
    .order('full_name', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('Error fetching participants:', error)
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
