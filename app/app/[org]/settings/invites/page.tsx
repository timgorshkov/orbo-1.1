import { redirect } from 'next/navigation'

export default async function OldInvitesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  redirect(`/p/${orgId}/settings/invites`)
}
