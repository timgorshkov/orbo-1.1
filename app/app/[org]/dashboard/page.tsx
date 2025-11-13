import { redirect } from 'next/navigation'

export default async function OldDashboardRedirect({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  
  // Редирект на новую страницу в /p/[org]
  redirect(`/p/${orgId}/dashboard`)
}
