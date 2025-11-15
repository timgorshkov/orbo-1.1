import { redirect } from 'next/navigation'

export default async function OldAppsPageRedirect({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  redirect(`/p/${org}/apps`)
}
