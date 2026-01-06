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
    { data: events }
  ] = await Promise.all([
    supabase.from('org_telegram_groups').select('org_id, tg_chat_id').in('org_id', orgIds),
    supabase.from('participants').select('id, org_id').in('org_id', orgIds),
    supabase.from('material_pages').select('id, org_id').in('org_id', orgIds),
    supabase.from('events').select('id, org_id').in('org_id', orgIds)
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
  
  // Форматируем данные
  const formattedOrgs = organizations.map(org => {
    const groups = groupsMap.get(org.id) || { count: 0, withBot: 0 }
    
    return {
      id: org.id,
      name: org.name,
      created_at: org.created_at,
      status: org.status || 'active',
      archived_at: org.archived_at,
      has_telegram: false,
      telegram_verified: false,
      telegram_username: null,
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
