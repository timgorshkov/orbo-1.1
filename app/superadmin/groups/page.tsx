import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import GroupsTable from '@/components/superadmin/groups-table'
import { createServiceLogger } from '@/lib/logger'
import { TelegramService } from '@/lib/services/telegramService'

const logger = createServiceLogger('SuperadminGroups');

export default async function SuperadminGroupsPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // ✅ ОПТИМИЗАЦИЯ: Получаем все данные ПАРАЛЛЕЛЬНО вместо N+1 запросов
  const [groupsResult, orgLinksResult, lastActivitiesResult, organizationsResult] = await Promise.all([
    // 1. Все группы
    supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id, bot_status, last_sync_at, member_count')
      .order('id', { ascending: false }),
    
    // 2. Все связи с организациями
    supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, org_id'),
    
    // 3. Последняя активность по группам (агрегат через RPC или просто последние события)
    supabase
      .from('activity_events')
      .select('tg_chat_id, created_at')
      .not('tg_chat_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500), // Последние 500 событий для расчёта last_activity
      
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
  lastActivities.forEach(activity => {
    const chatId = Number(activity.tg_chat_id)
    // Сохраняем только первую (самую свежую) запись для каждой группы
    if (!lastActivityByGroup.has(chatId)) {
      lastActivityByGroup.set(chatId, activity.created_at)
    }
  })
  
  // Получаем количество участников из Telegram API для групп с подключенным ботом
  const memberCountsMap = new Map<number, number>()
  const connectedGroups = groups.filter(g => g.bot_status === 'connected')
  
  if (connectedGroups.length > 0) {
    try {
      const telegramService = new TelegramService('main')
      
      // Делаем запросы параллельно с таймаутом
      const countPromises = connectedGroups.map(async (group) => {
        try {
          const chatId = Number(group.tg_chat_id)
          const result = await telegramService.getChatMembersCount(chatId)
          if (result?.ok && typeof result.result === 'number') {
            memberCountsMap.set(chatId, result.result)
            
            // Обновляем member_count в БД для кэширования
            await supabase
              .from('telegram_groups')
              .update({ member_count: result.result })
              .eq('id', group.id)
          }
        } catch (e) {
          // Ignore individual chat errors
        }
      })
      
      // Ждём все запросы с таймаутом 10 секунд
      await Promise.race([
        Promise.all(countPromises),
        new Promise(resolve => setTimeout(resolve, 10000))
      ])
    } catch (e) {
      logger.warn({ error: e }, 'Error getting member counts from Telegram')
    }
  }
  
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
      has_bot: group.bot_status === 'connected',
      has_admin_rights: group.bot_status === 'connected',
      participants_count: memberCountsMap.get(chatId) || group.member_count || 0,
      organizations_count: orgIds.length,
      organization_names: orgNames,
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
