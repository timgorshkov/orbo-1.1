import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import GroupsTable from '@/components/superadmin/groups-table'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SuperadminGroups');

export default async function SuperadminGroupsPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // ✅ ОПТИМИЗАЦИЯ: Получаем все данные ПАРАЛЛЕЛЬНО вместо N+1 запросов
  const [groupsResult, orgLinksResult, participantCountsResult, lastActivitiesResult] = await Promise.all([
    // 1. Все группы
    supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id, bot_status, last_sync_at, member_count')
      .order('id', { ascending: false }),
    
    // 2. Все связи с организациями
    supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, org_id'),
    
    // 3. Количество участников по группам (через participant_groups)
    supabase
      .from('participant_groups')
      .select('tg_group_id'),
    
    // 4. Последняя активность по группам (агрегат через RPC или просто последние события)
    supabase
      .from('activity_events')
      .select('tg_chat_id, created_at')
      .not('tg_chat_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500) // Последние 500 событий для расчёта last_activity
  ])
  
  const groups = groupsResult.data || []
  const orgLinks = orgLinksResult.data || []
  const participantGroups = participantCountsResult.data || []
  const lastActivities = lastActivitiesResult.data || []
  
  logger.debug({ 
    groups_count: groups.length,
    org_links_count: orgLinks.length,
    participant_groups_count: participantGroups.length,
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
  
  const participantsByGroup = new Map<number, number>()
  participantGroups.forEach(pg => {
    const chatId = Number(pg.tg_group_id)
    participantsByGroup.set(chatId, (participantsByGroup.get(chatId) || 0) + 1)
  })
  
  const lastActivityByGroup = new Map<number, string>()
  lastActivities.forEach(activity => {
    const chatId = Number(activity.tg_chat_id)
    // Сохраняем только первую (самую свежую) запись для каждой группы
    if (!lastActivityByGroup.has(chatId)) {
      lastActivityByGroup.set(chatId, activity.created_at)
    }
  })
  
  // Форматируем данные
  const formattedGroups = groups.map(group => {
    const chatId = Number(group.tg_chat_id)
    return {
      id: group.id,
      title: group.title,
      tg_chat_id: group.tg_chat_id,
      bot_status: group.bot_status,
      created_at: group.last_sync_at || null,
      has_bot: group.bot_status === 'connected',
      has_admin_rights: group.bot_status === 'connected',
      participants_count: participantsByGroup.get(chatId) || group.member_count || 0,
      organizations_count: orgsByGroup.get(chatId)?.length || 0,
      last_activity_at: lastActivityByGroup.get(chatId) || null
    }
  })
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Группы</h2>
        <p className="text-gray-600 mt-1">
          Все Telegram группы с метриками
        </p>
      </div>
      
      <GroupsTable groups={formattedGroups} />
    </div>
  )
}
