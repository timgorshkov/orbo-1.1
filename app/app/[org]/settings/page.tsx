import { redirect } from 'next/navigation'

export default async function OldSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  redirect(`/p/${orgId}/settings`)
}
