import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import UsersTable from '@/components/superadmin/users-table'

export default async function SuperadminUsersPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // Получаем пользователей с email (владельцы и админы организаций)
  const { data: memberships } = await supabase
    .from('memberships')
    .select(`
      user_id,
      role,
      org_id,
      organizations (
        name
      )
    `)
    .in('role', ['owner', 'admin'])
  
  // Группируем по user_id
  const userMap = new Map<string, any>()
  
  for (const membership of memberships || []) {
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
  
  // Получаем данные пользователей из auth.users
  const userIds = Array.from(userMap.keys())
  
  // Получаем email напрямую из auth.users (используем raw query через admin клиент)
  // PostgreSQL подзапрос для получения данных из auth схемы
  const { data: authUsersData, error: authError } = await supabase
    .rpc('get_users_by_ids', { user_ids: userIds })
  
  console.log('[Superadmin Users] Auth users from RPC:', authUsersData?.length || 0, 'Error:', authError)
  
  // Создаем Map для быстрого доступа к auth данным
  const authUsersMap = new Map(
    (authUsersData || []).map((u: any) => [u.id, u])
  )
  
  // Получаем данные из user_telegram_accounts
  const { data: allTgAccounts, error: allTgError } = await supabase
    .from('user_telegram_accounts')
    .select('user_id, telegram_first_name, telegram_last_name, telegram_username, is_verified, org_id')
    .in('user_id', userIds)
  
  console.log('[Superadmin Users] TG accounts fetched:', allTgAccounts?.length || 0, 'Error:', allTgError)
  console.log('[Superadmin Users] User IDs we need:', userIds.length)
  
  // Группируем по user_id
  const userDataMap = new Map<string, any>()
  
  userIds.forEach(userId => {
    const authUser: any = authUsersMap.get(userId)
    const tgAccount = allTgAccounts?.find((acc: any) => acc.user_id === userId)
    
    const fullName = tgAccount 
      ? ([tgAccount.telegram_first_name, tgAccount.telegram_last_name]
          .filter(Boolean)
          .join(' ') || tgAccount.telegram_username || 'Не указано')
      : (authUser?.raw_user_meta_data?.full_name || authUser?.email?.split('@')[0] || 'Не указано')
    
    const displayName = tgAccount?.telegram_username 
      ? `@${tgAccount.telegram_username}`
      : fullName
    
    userDataMap.set(userId, {
      full_name: fullName,
      telegram_display_name: tgAccount ? displayName : null,
      email: authUser?.email || 'N/A',
      email_confirmed: !!authUser?.email_confirmed_at,
      last_sign_in_at: authUser?.last_sign_in_at || null,
    })
  })
  
  // Получаем telegram аккаунты
  const { data: telegramAccounts, error: tgError } = await supabase
    .from('user_telegram_accounts')
    .select('user_id, telegram_user_id, is_verified, org_id')
    .in('user_id', userIds)
  
  console.log('[Superadmin Users] Telegram accounts:', telegramAccounts?.length, 'Error:', tgError)
  
  // Получаем уникальные telegram_user_id для поиска групп
  const tgUserIds = Array.from(new Set(telegramAccounts?.map(acc => acc.telegram_user_id).filter(Boolean)))
  
  console.log('[Superadmin Users] Unique TG user IDs:', tgUserIds.length)
  
  // Получаем группы где эти пользователи админы (через tg_chat_id)
  const { data: groupAdmins, error: groupAdminsError } = await supabase
    .from('telegram_group_admins')
    .select('tg_user_id, is_owner, tg_chat_id')
    .in('tg_user_id', tgUserIds)
  
  // Получаем информацию о группах
  const chatIds = Array.from(new Set(groupAdmins?.map((ga: any) => ga.tg_chat_id).filter(Boolean)))
  const { data: groups } = await supabase
    .from('telegram_groups')
    .select('tg_chat_id, bot_status')
    .in('tg_chat_id', chatIds)
  
  const groupsMap = new Map(groups?.map(g => [g.tg_chat_id, g]) || [])
  const enrichedGroupAdmins = groupAdmins?.map((ga: any) => ({
    ...ga,
    telegram_groups: groupsMap.get(ga.tg_chat_id)
  }))
  
  console.log('[Superadmin Users] Group admins:', enrichedGroupAdmins?.length, 'Error:', groupAdminsError)
  
  // Форматируем данные
  const formattedUsers = Array.from(userMap.entries()).map(([userId, userData]) => {
    const userInfo = userDataMap.get(userId)
    const tgAccounts = telegramAccounts?.filter(acc => acc.user_id === userId) || []
    const tgUserIds = tgAccounts.map(acc => acc.telegram_user_id).filter(Boolean)
    const groupsAsAdmin = enrichedGroupAdmins?.filter((ga: any) => 
      tgUserIds.includes(ga.tg_user_id) && 
      ga.telegram_groups?.bot_status === 'connected'
    ) || []
    
    return {
      user_id: userId,
      full_name: userInfo?.full_name || 'Не указано',
      email: userInfo?.email || 'N/A',
      email_confirmed: userInfo?.email_confirmed || false,
      telegram_verified: tgAccounts.some(acc => acc.is_verified),
      telegram_display_name: userInfo?.telegram_display_name || null,
      owner_orgs_count: userData.owner_orgs.length,
      admin_orgs_count: userData.admin_orgs.length,
      total_orgs_count: userData.total_orgs,
      groups_with_bot_count: groupsAsAdmin.length,
      last_sign_in_at: userInfo?.last_sign_in_at,
      created_at: undefined
    }
  }).sort((a, b) => {
    const dateA = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
    const dateB = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
    return dateB - dateA
  })
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Пользователи</h2>
        <p className="text-gray-600 mt-1">
          Владельцы и админы с авторизацией по email
        </p>
      </div>
      
      <UsersTable users={formattedUsers} />
    </div>
  )
}

