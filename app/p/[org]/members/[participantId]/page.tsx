import { notFound, redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'
import { getUserRoleInOrg } from '@/lib/auth/getUserRole'
import { getParticipantDetail } from '@/lib/server/getParticipantDetail'
import ParticipantDetailTabs from '@/components/members/participant-detail-tabs'

export const dynamic = 'force-dynamic'

export default async function ParticipantPage({ 
  params 
}: { 
  params: Promise<{ org: string; participantId: string }> 
}) {
  const { org: orgId, participantId } = await params
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

  // Check if viewing own profile
  const detail = await getParticipantDetail(orgId, participantId)
  
  if (!detail) {
    return notFound()
  }

  // Check if user can edit (admin or own profile via telegram)
  let isOwnProfile = false
  if (detail.participant.tg_user_id) {
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', detail.participant.tg_user_id)
      .eq('org_id', orgId)
      .single()
    
    isOwnProfile = telegramAccount?.user_id === user.id
  }

  const canEdit = isAdmin || isOwnProfile

  return (
    <div className="p-6">
      <ParticipantDetailTabs 
        orgId={orgId} 
        initialDetail={detail}
        isAdmin={isAdmin}
        canEdit={canEdit}
        currentUserId={user.id}
      />
    </div>
  )
}

