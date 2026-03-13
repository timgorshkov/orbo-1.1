import { redirect } from 'next/navigation'

export default function SubscriptionsPage({ params }: { params: { org: string } }) {
  redirect(`/p/${params.org}/membership`)
}
