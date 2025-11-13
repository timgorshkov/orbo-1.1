import { redirect } from 'next/navigation'

export default async function OldTelegramGroupPage({ params }: { params: Promise<{ org: string, id: string }> }) {
  const { org, id } = await params
  redirect(`/p/${org}/telegram/groups/${id}`)
}
