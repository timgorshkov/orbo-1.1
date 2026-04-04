import { requireOrgAccess } from '@/lib/orgGuard'
import TelegramAccountClient from './client-page'

export default async function TelegramAccountPage({ params }: { params: Promise<{ org: string }> }) {
  const resolvedParams = await params
  // ✅ Только владелец может управлять Telegram-аккаунтом организации (бот, синхронизация групп)
  await requireOrgAccess(resolvedParams.org, ['owner'])

  return <TelegramAccountClient params={resolvedParams} />
}
