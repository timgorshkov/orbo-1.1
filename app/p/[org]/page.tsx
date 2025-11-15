import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'
import AuthenticatedHome from '@/components/home/authenticated-home'
import PublicCommunityHub from '@/components/home/public-community-hub'

export const dynamic = 'force-dynamic'

export default async function CommunityHubPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const supabase = await createClientServer()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()

  // If not authenticated, show public version
  if (!user) {
    return <PublicCommunityHub orgId={orgId} />
  }

  // Check if user has access to this organization
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  // If no membership, redirect to auth page
  if (!membership) {
    redirect(`/p/${orgId}/auth`)
  }

  const isAdmin = membership.role === 'owner' || membership.role === 'admin'

  // Show authenticated version
  return <AuthenticatedHome orgId={orgId} isAdmin={isAdmin} />
}
