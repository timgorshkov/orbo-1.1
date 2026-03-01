import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import OrganizationsTable from '@/components/superadmin/organizations-table'

export default async function SuperadminOrganizationsPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // Получаем организации (простой запрос без JOIN)
  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, created_at, status, archived_at')
    .order('created_at', { ascending: false })
  
  if (!organizations || organizations.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Организации</h2>
          <p className="text-gray-600 mt-1">Нет организаций</p>
        </div>
      </div>
    )
  }
  
  const orgIds = organizations.map(o => o.id)
  
  // Параллельно получаем связанные данные
  const [
    { data: orgGroups },
    { data: participants },
    { data: materialPages },
    { data: events },
    { data: memberships },
    { data: telegramAccounts }
  ] = await Promise.all([
    supabase.from('org_telegram_groups').select('org_id, tg_chat_id').in('org_id', orgIds),
    supabase.from('participants').select('id, org_id').in('org_id', orgIds),
    supabase.from('material_pages').select('id, org_id').in('org_id', orgIds),
    supabase.from('events').select('id, org_id').in('org_id', orgIds),
    supabase.from('memberships').select('org_id, user_id, role').in('org_id', orgIds).in('role', ['owner', 'admin']),
    supabase.from('user_telegram_accounts').select('org_id, user_id, is_verified, telegram_username, telegram_first_name, telegram_last_name').in('org_id', orgIds)
  ])
  
  // Получаем telegram_groups для подсчёта bot_status
  const chatIds = Array.from(new Set(orgGroups?.map(g => g.tg_chat_id) || []))
  const { data: telegramGroups } = chatIds.length > 0 
    ? await supabase.from('telegram_groups').select('id, tg_chat_id, bot_status').in('tg_chat_id', chatIds)
    : { data: [] }
  
  // Создаём маппинги
  const groupsMap = new Map<string, { count: number, withBot: number }>()
  for (const og of orgGroups || []) {
    if (!groupsMap.has(og.org_id)) {
      groupsMap.set(og.org_id, { count: 0, withBot: 0 })
    }
    const entry = groupsMap.get(og.org_id)!
    entry.count++
    
    const tg = telegramGroups?.find(t => t.tg_chat_id === og.tg_chat_id)
    if (tg?.bot_status === 'connected') {
      entry.withBot++
    }
  }
  
  const participantsMap = new Map<string, number>()
  for (const p of participants || []) {
    participantsMap.set(p.org_id, (participantsMap.get(p.org_id) || 0) + 1)
  }
  
  const materialsMap = new Map<string, number>()
  for (const m of materialPages || []) {
    materialsMap.set(m.org_id, (materialsMap.get(m.org_id) || 0) + 1)
  }
  
  const eventsMap = new Map<string, number>()
  for (const e of events || []) {
    eventsMap.set(e.org_id, (eventsMap.get(e.org_id) || 0) + 1)
  }
  
  // Создаём маппинг telegram для организаций (по owner/admin)
  const telegramMap = new Map<string, { has_telegram: boolean, telegram_verified: boolean, telegram_username: string | null, telegram_display_name: string | null }>()
  for (const ta of telegramAccounts || []) {
    const isOwnerOrAdmin = memberships?.some(m => m.org_id === ta.org_id && m.user_id === ta.user_id)
    if (!isOwnerOrAdmin) continue
    const displayName = [ta.telegram_first_name, ta.telegram_last_name].filter(Boolean).join(' ') || null
    const existing = telegramMap.get(ta.org_id)
    if (!existing) {
      telegramMap.set(ta.org_id, {
        has_telegram: true,
        telegram_verified: ta.is_verified || false,
        telegram_username: ta.telegram_username || null,
        telegram_display_name: displayName,
      })
    } else {
      // Merge: prefer entry with more data
      telegramMap.set(ta.org_id, {
        has_telegram: true,
        telegram_verified: ta.is_verified || existing.telegram_verified,
        telegram_username: ta.telegram_username || existing.telegram_username,
        telegram_display_name: displayName || existing.telegram_display_name,
      })
    }
  }
  
  // Получаем email владельцев организаций
  const ownerUserIds = Array.from(new Set(
    memberships?.filter(m => m.role === 'owner').map(m => m.user_id) || []
  ))
  
  // Получаем email и имена из нескольких источников
  const [{ data: ownerUsers }, { data: ownerAccounts }, { data: ownerTelegramAccounts }] = await Promise.all([
    ownerUserIds.length > 0
      ? supabase.from('users').select('id, email, name').in('id', ownerUserIds)
      : Promise.resolve({ data: [] }),
    ownerUserIds.length > 0
      ? supabase.from('accounts').select('user_id, provider, provider_account_id').in('user_id', ownerUserIds).in('provider', ['email', 'google', 'yandex'])
      : Promise.resolve({ data: [] }),
    ownerUserIds.length > 0
      ? supabase.from('user_telegram_accounts').select('user_id, telegram_first_name, telegram_last_name, telegram_username').in('user_id', ownerUserIds)
      : Promise.resolve({ data: [] })
  ])
  
  // Создаём маппинг email и имени для организаций (по owner)
  // Приоритет email: users.email -> accounts(email).provider_account_id
  // Приоритет имени: users.name -> telegram full name -> telegram_username
  // Build merged telegram info per owner user (may have multiple rows, pick best)
  const ownerTgMerged = new Map<string, { first_name: string | null, last_name: string | null, username: string | null }>()
  for (const t of ownerTelegramAccounts || []) {
    const existing = ownerTgMerged.get(t.user_id)
    if (!existing) {
      ownerTgMerged.set(t.user_id, { first_name: t.telegram_first_name || null, last_name: t.telegram_last_name || null, username: t.telegram_username || null })
    } else {
      ownerTgMerged.set(t.user_id, {
        first_name: t.telegram_first_name || existing.first_name,
        last_name: t.telegram_last_name || existing.last_name,
        username: t.telegram_username || existing.username,
      })
    }
  }

  const orgOwnerMap = new Map<string, { email: string | null, name: string | null }>()
  for (const membership of memberships || []) {
    if (membership.role === 'owner' && !orgOwnerMap.has(membership.org_id)) {
      const ownerUser = ownerUsers?.find(u => u.id === membership.user_id)
      const ownerAccount = ownerAccounts?.find(a => a.user_id === membership.user_id && a.provider === 'email')
      const ownerTelegram = ownerTgMerged.get(membership.user_id)
      
      // Email: только реальные email
      const email = ownerUser?.email || ownerAccount?.provider_account_id || null
      
      // Имя: users.name -> telegram name -> telegram_username
      const telegramName = ownerTelegram 
        ? [ownerTelegram.first_name, ownerTelegram.last_name].filter(Boolean).join(' ') 
        : null
      const name = ownerUser?.name || telegramName || (ownerTelegram?.username ? `@${ownerTelegram.username}` : null)
      
      orgOwnerMap.set(membership.org_id, { email, name })
    }
  }
  
  // Форматируем данные
  const formattedOrgs = organizations.map(org => {
    const groups = groupsMap.get(org.id) || { count: 0, withBot: 0 }
    const telegram = telegramMap.get(org.id) || { has_telegram: false, telegram_verified: false, telegram_username: null, telegram_display_name: null }
    const ownerInfo = orgOwnerMap.get(org.id) || { email: null, name: null }
    
    return {
      id: org.id,
      name: org.name,
      owner_email: ownerInfo.email,
      owner_name: ownerInfo.name,
      created_at: org.created_at,
      status: org.status || 'active',
      archived_at: org.archived_at,
      has_telegram: telegram.has_telegram,
      telegram_verified: telegram.telegram_verified,
      telegram_username: telegram.telegram_username,
      telegram_display_name: telegram.telegram_display_name,
      groups_count: groups.count,
      groups_with_bot: groups.withBot,
      participants_count: participantsMap.get(org.id) || 0,
      materials_count: materialsMap.get(org.id) || 0,
      events_count: eventsMap.get(org.id) || 0
    }
  })
  
  // Разделяем на активные и архивные
  const activeOrgs = formattedOrgs.filter(o => o.status === 'active')
  const archivedOrgs = formattedOrgs.filter(o => o.status === 'archived')
  
  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Организации</h2>
          <p className="text-gray-600 mt-1">
            Все организации платформы с метриками ({formattedOrgs.length} всего)
          </p>
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          <span className="px-3 py-1.5 text-xs rounded-md bg-white shadow-sm text-gray-900 font-medium">
            Организации
          </span>
          <a
            href="/superadmin/groups"
            className="px-3 py-1.5 text-xs rounded-md text-gray-600 hover:text-gray-900 transition-colors"
          >
            Группы
          </a>
        </div>
      </div>
      
      <OrganizationsTable 
        organizations={activeOrgs} 
        archivedOrganizations={archivedOrgs}
      />
    </div>
  )
}
