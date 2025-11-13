import { redirect } from 'next/navigation'

export default async function OldEventsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  redirect(`/p/${orgId}/events`)
}
