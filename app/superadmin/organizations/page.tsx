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
    supabase.from('user_telegram_accounts').select('org_id, user_id, is_verified, telegram_username').in('org_id', orgIds)
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
  const telegramMap = new Map<string, { has_telegram: boolean, telegram_verified: boolean, telegram_username: string | null }>()
  for (const ta of telegramAccounts || []) {
    // Проверяем что этот telegram аккаунт принадлежит owner или admin
    const isOwnerOrAdmin = memberships?.some(m => m.org_id === ta.org_id && m.user_id === ta.user_id)
    if (isOwnerOrAdmin && !telegramMap.has(ta.org_id)) {
      telegramMap.set(ta.org_id, {
        has_telegram: true,
        telegram_verified: ta.is_verified || false,
        telegram_username: ta.telegram_username
      })
    }
  }
  
  // Получаем email владельцев организаций
  const ownerUserIds = Array.from(new Set(
    memberships?.filter(m => m.role === 'owner').map(m => m.user_id) || []
  ))
  
  const { data: ownerUsers } = ownerUserIds.length > 0
    ? await supabase.from('users').select('id, email').in('id', ownerUserIds)
    : { data: [] }
  
  // Создаём маппинг email для организаций (по owner)
  const orgEmailMap = new Map<string, string>()
  for (const membership of memberships || []) {
    if (membership.role === 'owner' && !orgEmailMap.has(membership.org_id)) {
      const ownerUser = ownerUsers?.find(u => u.id === membership.user_id)
      if (ownerUser?.email) {
        orgEmailMap.set(membership.org_id, ownerUser.email)
      }
    }
  }
  
  // Форматируем данные
  const formattedOrgs = organizations.map(org => {
    const groups = groupsMap.get(org.id) || { count: 0, withBot: 0 }
    const telegram = telegramMap.get(org.id) || { has_telegram: false, telegram_verified: false, telegram_username: null }
    
    return {
      id: org.id,
      name: org.name,
      owner_email: orgEmailMap.get(org.id) || null,
      created_at: org.created_at,
      status: org.status || 'active',
      archived_at: org.archived_at,
      has_telegram: telegram.has_telegram,
      telegram_verified: telegram.telegram_verified,
      telegram_username: telegram.telegram_username,
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Организации</h2>
        <p className="text-gray-600 mt-1">
          Все организации платформы с метриками ({formattedOrgs.length} всего)
        </p>
      </div>
      
      <OrganizationsTable 
        organizations={activeOrgs} 
        archivedOrganizations={archivedOrgs}
      />
    </div>
  )
}
