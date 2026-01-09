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
  
  // Получаем данные пользователей из нескольких источников параллельно
  const [
    { data: usersData },
    { data: accountsData },
    { data: membershipsData },
    { data: telegramAccounts }
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, name, email_verified, image, created_at')
      .in('id', userIds),
    supabase
      .from('accounts')
      .select('user_id, provider, provider_account_id')
      .in('user_id', userIds),
    supabase
      .from('memberships')
      .select('user_id, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_telegram_accounts')
      .select('user_id, telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, is_verified')
      .in('user_id', userIds)
  ])
  
  const usersMap = new Map((usersData || []).map(u => [u.id, u]))
  
  // Создаём карту email из accounts (для пользователей без email в users)
  const accountEmailMap = new Map<string, string>()
  const hasEmailAuthMap = new Map<string, boolean>()
  accountsData?.forEach(acc => {
    if (acc.provider === 'email' && acc.provider_account_id) {
      accountEmailMap.set(acc.user_id, acc.provider_account_id)
      hasEmailAuthMap.set(acc.user_id, true) // Если есть запись в accounts с email provider, значит email подтверждён
    }
    // Google/Yandex OAuth тоже означает подтверждённый email
    if ((acc.provider === 'google' || acc.provider === 'yandex') && acc.provider_account_id) {
      // Для OAuth provider_account_id это не email, но можно попробовать извлечь из users
      hasEmailAuthMap.set(acc.user_id, true)
    }
  })
  
  // Создаём карту последних входов из memberships (когда пользователь присоединился к организации)
  // Это лучше чем sessions, так как sessions может быть пустой
  const lastLoginMap = new Map<string, string>()
  membershipsData?.forEach(membership => {
    if (!lastLoginMap.has(membership.user_id) || 
        new Date(membership.created_at) > new Date(lastLoginMap.get(membership.user_id) || '')) {
      lastLoginMap.set(membership.user_id, membership.created_at)
    }
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
    // Email подтверждён если: есть email_verified в users ИЛИ есть запись в accounts (OAuth/email auth)
    const emailConfirmed = !!user?.email_verified || hasEmailAuthMap.has(userId)
    
    return {
      user_id: userId,
      full_name: fullName,
      email: email || 'N/A',
      email_confirmed: emailConfirmed,
      telegram_verified: tgAccounts.some(acc => acc.is_verified),
      telegram_display_name: telegramDisplayName,
      owner_orgs_count: userData.owner_orgs.length,
      admin_orgs_count: userData.admin_orgs.length,
      total_orgs_count: userData.total_orgs,
      groups_with_bot_count: groupsAsAdmin.length,
      last_sign_in_at: lastLoginMap.get(userId) || undefined,
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
