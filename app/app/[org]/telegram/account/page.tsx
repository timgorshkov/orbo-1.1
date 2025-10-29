import { requireOrgAccess } from '@/lib/orgGuard'
import TelegramAccountClient from './client-page'

export default async function TelegramAccountPage({ params }: { params: { org: string } }) {
  // ✅ Только владелец может управлять Telegram-аккаунтом организации (бот, синхронизация групп)
  await requireOrgAccess(params.org, ['owner'])
  
  return <TelegramAccountClient params={params} />
}
