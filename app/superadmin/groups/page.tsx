import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import GroupsTable from '@/components/superadmin/groups-table'
import { TelegramHealthStatus } from '@/components/superadmin/telegram-health-status'

export default async function SuperadminGroupsPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // Получаем группы с метриками
  const { data: groups, error: groupsError } = await supabase
    .from('telegram_groups')
    .select(`
      id,
      title,
      tg_chat_id,
      bot_status,
      verification_status,
      last_sync_at
    `)
    .order('id', { ascending: false })
  
  console.log('[Superadmin Groups] Loaded groups:', groups?.length, 'Error:', groupsError)
  
  // Для каждой группы получаем связанные данные
  const groupsWithMetrics = await Promise.all((groups || []).map(async (group) => {
    // Связанные организации (используем tg_chat_id)
    const { data: orgLinks, error: orgError } = await supabase
      .from('org_telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', group.tg_chat_id)
    
    // Участники этой группы (уникальные по tg_user_id)
    // Получаем через JOIN с participants для доступа к tg_user_id
    const { data: participantsData, error: participantsError } = await supabase
      .from('participant_groups')
      .select(`
        participants!inner (
          tg_user_id
        )
      `)
      .eq('tg_group_id', group.tg_chat_id)
    
    // Считаем уникальные tg_user_id
    const participantsCount = participantsData 
      ? new Set(
          participantsData
            .map((p: any) => p.participants?.tg_user_id)
            .filter(Boolean)
        ).size
      : 0
    
    // Активность в этой группе (используем tg_chat_id)
    const { data: activities, error: activitiesError } = await supabase
      .from('activity_events')
      .select('created_at')
      .eq('tg_chat_id', group.tg_chat_id)
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (group.id === (groups || [])[0]?.id) {
      console.log('[Superadmin Groups] First group metrics:', {
        group_id: group.id,
        tg_chat_id: group.tg_chat_id,
        orgs: orgLinks?.length || 0,
        participants: participantsCount || 0,
        lastActivity: activities?.[0]?.created_at,
        errors: { orgError, participantsError, activitiesError }
      })
    }
    
    return {
      ...group,
      org_telegram_groups: orgLinks || [],
      participants_count: participantsCount || 0,
      last_activity: activities?.[0]?.created_at || null
    }
  }))
  
  // Форматируем данные
  const formattedGroups = groupsWithMetrics.map(group => {
    return {
      id: group.id,
      title: group.title,
      tg_chat_id: group.tg_chat_id,
      bot_status: group.bot_status,
      verification_status: group.verification_status, // Legacy, для отображения в таблице
      created_at: group.last_sync_at || null,
      has_bot: group.bot_status === 'connected',
      has_admin_rights: group.bot_status === 'connected', // FIX: используем bot_status вместо verification_status
      participants_count: group.participants_count || 0,
      organizations_count: group.org_telegram_groups?.length || 0,
      last_activity_at: group.last_activity
    }
  })
  
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Группы</h2>
          <p className="text-gray-600 mt-1">
            Все Telegram группы с метриками
          </p>
        </div>
        
        {/* Telegram Webhook Health Status */}
        <div className="w-80 flex-shrink-0">
          <TelegramHealthStatus />
        </div>
      </div>
      
      <GroupsTable groups={formattedGroups} />
    </div>
  )
}

