import { redirect } from 'next/navigation'

export default async function OldProfilePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  redirect(`/p/${orgId}/profile`)
}
