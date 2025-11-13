import { redirect } from 'next/navigation'

export default async function OldTelegramGroupRedirect({ params }: { params: Promise<{ org: string, chatId: string }> }) {
  const { org, chatId } = await params
  redirect(`/p/${org}/telegram/groups/${chatId}`)
}

