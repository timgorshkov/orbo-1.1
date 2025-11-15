import { redirect } from 'next/navigation'

export default async function AvailableGroupsPageRedirect({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  // Redirect to old path - this page hasn't been migrated yet
  redirect(`/app/${org}/telegram/available-groups`)
}

