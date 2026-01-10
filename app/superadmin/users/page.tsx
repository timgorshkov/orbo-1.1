import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import UsersTable from '@/components/superadmin/users-table'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SuperadminUsers')

export default async function SuperadminUsersPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // Получаем memberships с названиями организаций
  const { data: memberships } = await supabase
    .from('memberships')
    .select('user_id, role, org_id, organizations(name)')
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
        owner_orgs: [] as { id: string, name: string }[],
        admin_orgs: [] as { id: string, name: string }[],
        total_orgs: 0
      })
    }
    
    const userData = userMap.get(membership.user_id)!
    const orgName = (membership.organizations as any)?.name || 'Без названия'
    
    if (membership.role === 'owner') {
      userData.owner_orgs.push({ id: membership.org_id, name: orgName })
    } else {
      userData.admin_orgs.push({ id: membership.org_id, name: orgName })
    }
    userData.total_orgs++
  }
  
  const userIds = Array.from(userMap.keys())
  
  // Получаем данные пользователей из нескольких источников параллельно
  const [
    { data: usersData },
    { data: accountsData },
    { data: sessionsData },
    { data: telegramAccounts },
    { data: qualificationData }
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, name, email_verified, image, created_at, is_test')
      .in('id', userIds),
    supabase
      .from('accounts')
      .select('user_id, provider, provider_account_id, updated_at')
      .in('user_id', userIds),
    supabase
      .from('sessions')
      .select('user_id, expires')
      .in('user_id', userIds)
      .order('expires', { ascending: false }),
    supabase
      .from('user_telegram_accounts')
      .select('user_id, telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, is_verified')
      .in('user_id', userIds),
    supabase
      .from('user_qualification_responses')
      .select('user_id, responses, completed_at')
      .in('user_id', userIds)
  ])
  
  const usersMap = new Map((usersData || []).map(u => [u.id, u]))
  
  // Создаём карту email из accounts (для пользователей без email в users)
  const accountEmailMap = new Map<string, string>()
  // Создаём карту последней активности из accounts.updated_at
  const accountActivityMap = new Map<string, string>()
  accountsData?.forEach(acc => {
    if (acc.provider === 'email' && acc.provider_account_id) {
      accountEmailMap.set(acc.user_id, acc.provider_account_id)
    }
    // Отслеживаем updated_at как показатель активности
    if (acc.updated_at) {
      const current = accountActivityMap.get(acc.user_id)
      if (!current || new Date(acc.updated_at) > new Date(current)) {
        accountActivityMap.set(acc.user_id, acc.updated_at)
      }
    }
  })
  
  // Создаём карту последних входов из sessions
  const lastLoginMap = new Map<string, string>()
  sessionsData?.forEach(session => {
    // expires показывает когда сессия истекает, используем как показатель активности
    if (!lastLoginMap.has(session.user_id)) {
      lastLoginMap.set(session.user_id, session.expires)
    }
  })
  
  // Создаём карту квалификации
  const qualificationMap = new Map<string, { responses: any, completed_at: string | null }>()
  qualificationData?.forEach(q => {
    qualificationMap.set(q.user_id, { responses: q.responses, completed_at: q.completed_at })
  })
  
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
    
    // Получаем email из разных источников (users.email или accounts.provider_account_id)
    const email = user?.email || accountEmailMap.get(userId) || null
    
    // Получаем последний вход: sessions > accounts.updated_at > created_at
    const lastLogin = lastLoginMap.get(userId) || accountActivityMap.get(userId) || user?.created_at || null
    
    // Получаем квалификацию
    const qualification = qualificationMap.get(userId)
    
    // Получаем боли (pain_points — массив)
    const painPoints = qualification?.responses?.pain_points || []
    
    return {
      user_id: userId,
      full_name: fullName,
      email: email || 'N/A',
      is_test: user?.is_test || false,
      telegram_verified: tgAccounts.some(acc => acc.is_verified),
      telegram_display_name: telegramDisplayName,
      owner_orgs_count: userData.owner_orgs.length,
      owner_orgs_names: userData.owner_orgs.map((o: { name: string }) => o.name),
      admin_orgs_count: userData.admin_orgs.length,
      admin_orgs_names: userData.admin_orgs.map((o: { name: string }) => o.name),
      total_orgs_count: userData.total_orgs,
      groups_with_bot_count: groupsAsAdmin.length,
      last_sign_in_at: lastLogin,
      created_at: user?.created_at,
      qualification_completed: !!qualification?.completed_at,
      qualification_role: qualification?.responses?.role || null,
      qualification_community_type: qualification?.responses?.community_type || null,
      qualification_groups_count: qualification?.responses?.groups_count || null,
      qualification_pain_points: Array.isArray(painPoints) ? painPoints : [],
    }
  }).sort((a, b) => {
    // Сначала обычные пользователи, потом тестовые
    if (a.is_test !== b.is_test) {
      return a.is_test ? 1 : -1
    }
    // Внутри каждой группы — по дате создания (новые сверху)
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
