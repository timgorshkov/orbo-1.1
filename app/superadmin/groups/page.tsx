import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import GroupsTable from '@/components/superadmin/groups-table'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SuperadminGroups');

export default async function SuperadminGroupsPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // ✅ ОПТИМИЗАЦИЯ: Получаем все данные ПАРАЛЛЕЛЬНО вместо N+1 запросов
  const [groupsResult, orgLinksResult, lastActivitiesResult, organizationsResult] = await Promise.all([
    // 1. Все активные группы (без мигрированных дублей и личных чатов)
    supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id, bot_status, last_sync_at, member_count')
      .is('migrated_to', null)
      .lt('tg_chat_id', 0)
      .order('id', { ascending: false }),
    
    // 2. Все связи с организациями
    supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, org_id'),
    
    // 3. Последняя активность по группам (агрегат)
    supabase.raw(
      `SELECT tg_chat_id, MAX(created_at) as last_activity_at
       FROM activity_events
       WHERE tg_chat_id IS NOT NULL
       GROUP BY tg_chat_id`,
      []
    ),
      
    // 4. Все организации для отображения названий
    supabase
      .from('organizations')
      .select('id, name')
  ])
  
  const groups = groupsResult.data || []
  const orgLinks = orgLinksResult.data || []
  const lastActivities = lastActivitiesResult.data || []
  const organizations = organizationsResult.data || []
  
  // Создаём карту организаций
  const orgNamesMap = new Map<string, string>()
  organizations.forEach(org => {
    orgNamesMap.set(org.id, org.name)
  })
  
  logger.debug({ 
    groups_count: groups.length,
    org_links_count: orgLinks.length,
    last_activities_count: lastActivities.length
  }, 'Loaded data');
  
  // Создаём карты для быстрого доступа
  const orgsByGroup = new Map<number, string[]>()
  orgLinks.forEach(link => {
    const chatId = Number(link.tg_chat_id)
    if (!orgsByGroup.has(chatId)) {
      orgsByGroup.set(chatId, [])
    }
    orgsByGroup.get(chatId)!.push(link.org_id)
  })
  
  const lastActivityByGroup = new Map<number, string>()
  lastActivities.forEach((activity: any) => {
    const chatId = Number(activity.tg_chat_id)
    if (activity.last_activity_at) {
      lastActivityByGroup.set(chatId, activity.last_activity_at)
    }
  })
  
  // member_count берётся из БД (обновляется кроном update-group-metrics каждые 5 мин)
  // Не дёргаем Telegram API при рендере — это вызывает rate limit (429) при 60+ группах

  // Форматируем данные
  const formattedGroups = groups.map(group => {
    const chatId = Number(group.tg_chat_id)
    const orgIds = orgsByGroup.get(chatId) || []
    const orgNames = orgIds.map(id => orgNamesMap.get(id)).filter(Boolean) as string[]
    
    return {
      id: group.id,
      title: group.title,
      tg_chat_id: group.tg_chat_id,
      bot_status: group.bot_status,
      created_at: group.last_sync_at || null,
      has_bot: group.bot_status === 'connected' || group.bot_status === 'pending',
      has_admin_rights: group.bot_status === 'connected',
      participants_count: group.member_count || 0,
      organizations_count: orgIds.length,
      organization_names: orgNames,
      last_activity_at: lastActivityByGroup.get(chatId) || null
    }
  })
  
  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Группы</h2>
          <p className="text-gray-600 mt-1">
            Все Telegram группы с метриками
          </p>
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          <a
            href="/superadmin/organizations"
            className="px-3 py-1.5 text-xs rounded-md text-gray-600 hover:text-gray-900 transition-colors"
          >
            Организации
          </a>
          <span className="px-3 py-1.5 text-xs rounded-md bg-white shadow-sm text-gray-900 font-medium">
            Группы
          </span>
        </div>
      </div>
      
      <GroupsTable groups={formattedGroups} />
    </div>
  )
}
