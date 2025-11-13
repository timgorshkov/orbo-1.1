import { redirect } from 'next/navigation'

export default async function OldMembersPage({ params, searchParams }: { 
  params: Promise<{ org: string }>
  searchParams: Promise<{ tab?: string }> 
}) {
  const { org: orgId } = await params
  const { tab = 'list' } = await searchParams
  
  // Redirect to new path with tab parameter
  const tabParam = tab !== 'list' ? `?tab=${tab}` : ''
  redirect(`/p/${orgId}/members${tabParam}`)
}
