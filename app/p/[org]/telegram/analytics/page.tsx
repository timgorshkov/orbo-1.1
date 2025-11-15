import { redirect } from 'next/navigation'

export default async function TelegramAnalyticsPageRedirect({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  // Redirect to main telegram page for now
  redirect(`/p/${org}/telegram`)
}

