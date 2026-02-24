import { createAdminServer } from '@/lib/server/supabaseServer'

/**
 * Checks whether at least one org owner/admin is a current Telegram admin
 * of the given group. Uses `telegram_group_admins` table data that is kept
 * fresh by the webhook handler and `sync-admin-rights` cron.
 *
 * Returns `true` when access is confirmed, `false` when no org admin has
 * active Telegram admin rights in the group.
 */
export async function verifyOrgGroupAccess(
  orgId: string,
  tgChatId: string | number
): Promise<boolean> {
  const supabase = createAdminServer()

  // 1. Get tg_user_ids of all org owners/admins via their telegram accounts
  const { data: members } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin'])

  if (!members || members.length === 0) return false

  const userIds = members.map(m => m.user_id)

  // Get telegram_user_ids for these org members
  const { data: tgAccounts } = await supabase
    .from('user_telegram_accounts')
    .select('telegram_user_id')
    .eq('org_id', orgId)
    .eq('is_verified', true)
    .in('user_id', userIds)

  if (!tgAccounts || tgAccounts.length === 0) return false

  const tgUserIds = tgAccounts.map(a => a.telegram_user_id)

  // 2. Check if any of those tg_user_ids are active admins of the group
  const chatId = typeof tgChatId === 'string' ? BigInt(tgChatId) : tgChatId

  const { data: activeAdmins } = await supabase
    .from('telegram_group_admins')
    .select('tg_user_id')
    .eq('tg_chat_id', String(chatId))
    .eq('is_admin', true)
    .gt('expires_at', new Date().toISOString())
    .in('tg_user_id', tgUserIds)
    .limit(1)

  return (activeAdmins?.length ?? 0) > 0
}

/**
 * Batch version: checks access for multiple groups at once.
 * Returns a Set of tg_chat_ids that have valid org admin access.
 */
export async function verifyOrgGroupAccessBatch(
  orgId: string,
  tgChatIds: (string | number)[]
): Promise<Set<string>> {
  if (tgChatIds.length === 0) return new Set()

  const supabase = createAdminServer()

  const { data: members } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin'])

  if (!members || members.length === 0) return new Set()

  const userIds = members.map(m => m.user_id)

  const { data: tgAccounts } = await supabase
    .from('user_telegram_accounts')
    .select('telegram_user_id')
    .eq('org_id', orgId)
    .eq('is_verified', true)
    .in('user_id', userIds)

  if (!tgAccounts || tgAccounts.length === 0) return new Set()

  const tgUserIds = tgAccounts.map(a => a.telegram_user_id)
  const chatIdStrs = tgChatIds.map(id => String(id))

  const { data: activeAdmins } = await supabase
    .from('telegram_group_admins')
    .select('tg_chat_id')
    .eq('is_admin', true)
    .gt('expires_at', new Date().toISOString())
    .in('tg_chat_id', chatIdStrs)
    .in('tg_user_id', tgUserIds)

  const validSet = new Set<string>()
  activeAdmins?.forEach(a => validSet.add(String(a.tg_chat_id)))
  return validSet
}
