import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import UsersTable from '@/components/superadmin/users-table'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SuperadminUsers')

export default async function SuperadminUsersPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // Получаем memberships (простой запрос без JOIN)
  const { data: memberships } = await supabase
    .from('memberships')
    .select('user_id, role, org_id')
    .in('role', ['owner', 'admin'])
  
  if (!memberships || memberships.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Пользователи</h2>
          <p className="text-gray-600 mt-1">Нет пользователей</p>
        </div>
      </div>
    )
  }
  
  // Группируем по user_id
  const userMap = new Map<string, any>()
  
  for (const membership of memberships) {
    if (!userMap.has(membership.user_id)) {
      userMap.set(membership.user_id, {
        user_id: membership.user_id,
        owner_orgs: [],
        admin_orgs: [],
        total_orgs: 0
      })
    }
    
    const userData = userMap.get(membership.user_id)!
    
    if (membership.role === 'owner') {
      userData.owner_orgs.push(membership.org_id)
    } else {
      userData.admin_orgs.push(membership.org_id)
    }
    userData.total_orgs++
  }
  
  const userIds = Array.from(userMap.keys())
  
  // Получаем данные пользователей из локальной таблицы users
  const { data: usersData } = await supabase
    .from('users')
    .select('id, email, name, email_verified, image, created_at')
    .in('id', userIds)
  
  const usersMap = new Map((usersData || []).map(u => [u.id, u]))
  
  // Получаем время последнего входа из сессий
  const { data: lastSessions } = await supabase
    .from('sessions')
    .select('user_id, created_at')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
  
  // Создаём карту последних входов (берём самую свежую сессию для каждого пользователя)
  const lastLoginMap = new Map<string, string>()
  lastSessions?.forEach(session => {
    if (!lastLoginMap.has(session.user_id)) {
      lastLoginMap.set(session.user_id, session.created_at)
    }
  })
  
  // Получаем telegram аккаунты
  const { data: telegramAccounts } = await supabase
    .from('user_telegram_accounts')
    .select('user_id, telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, is_verified')
    .in('user_id', userIds)
  
  // Получаем уникальные telegram_user_id для поиска групп
  const tgUserIds = Array.from(new Set(
    (telegramAccounts || []).map(acc => acc.telegram_user_id).filter(Boolean)
  ))
  
  // Получаем группы где пользователь админ
  const { data: groupAdmins } = tgUserIds.length > 0
    ? await supabase
        .from('telegram_group_admins')
        .select('tg_user_id, tg_chat_id')
        .in('tg_user_id', tgUserIds)
    : { data: [] }
  
  // Получаем информацию о группах с ботом
  const chatIds = Array.from(new Set((groupAdmins || []).map(ga => ga.tg_chat_id).filter(Boolean)))
  const { data: groups } = chatIds.length > 0
    ? await supabase
        .from('telegram_groups')
        .select('tg_chat_id, bot_status')
        .in('tg_chat_id', chatIds)
        .eq('bot_status', 'connected')
    : { data: [] }
  
  const groupsWithBotSet = new Set((groups || []).map(g => g.tg_chat_id))
  
  // Форматируем данные
  const formattedUsers = Array.from(userMap.entries()).map(([userId, userData]) => {
    const user = usersMap.get(userId)
    const tgAccounts = (telegramAccounts || []).filter(acc => acc.user_id === userId)
    const tgAccount = tgAccounts[0]
    
    const tgUserIdsForUser = tgAccounts.map(acc => acc.telegram_user_id).filter(Boolean)
    const groupsAsAdmin = (groupAdmins || []).filter(ga => 
      tgUserIdsForUser.includes(ga.tg_user_id) && 
      groupsWithBotSet.has(ga.tg_chat_id)
    )
    
    const fullName = tgAccount 
      ? ([tgAccount.telegram_first_name, tgAccount.telegram_last_name]
          .filter(Boolean)
          .join(' ') || tgAccount.telegram_username || 'Не указано')
      : (user?.name || user?.email?.split('@')[0] || 'Не указано')
    
    const telegramDisplayName = tgAccount?.telegram_username 
      ? `@${tgAccount.telegram_username}`
      : (tgAccount ? fullName : null)
    
    return {
      user_id: userId,
      full_name: fullName,
      email: user?.email || 'N/A',
      email_confirmed: !!user?.email_verified,
      telegram_verified: tgAccounts.some(acc => acc.is_verified),
      telegram_display_name: telegramDisplayName,
      owner_orgs_count: userData.owner_orgs.length,
      admin_orgs_count: userData.admin_orgs.length,
      total_orgs_count: userData.total_orgs,
      groups_with_bot_count: groupsAsAdmin.length,
      last_sign_in_at: lastLoginMap.get(userId) || null,
      created_at: user?.created_at
    }
  }).sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA
  })
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Пользователи</h2>
        <p className="text-gray-600 mt-1">
          Пользователи с организациями ({formattedUsers.length} всего)
        </p>
      </div>
      
      <UsersTable users={formattedUsers} />
    </div>
  )
}
