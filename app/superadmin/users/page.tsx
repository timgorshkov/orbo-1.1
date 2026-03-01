import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import UsersTable from '@/components/superadmin/users-table'

export default async function SuperadminUsersPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // Step 1: Fetch ALL users (not just those with memberships)
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, email, name, email_verified, image, created_at, is_test')
    .order('created_at', { ascending: false })
  
  if (!allUsers || allUsers.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Пользователи</h2>
          <p className="text-gray-600 mt-1">Нет пользователей</p>
        </div>
      </div>
    )
  }
  
  const userIds = allUsers.map(u => u.id)
  
  // Step 2: Fetch all related data in parallel
  const [
    { data: memberships },
    { data: accountsData },
    { data: sessionsData },
    { data: telegramAccounts },
    { data: qualificationData }
  ] = await Promise.all([
    supabase
      .from('memberships')
      .select('user_id, role, org_id')
      .in('user_id', userIds),
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
  
  // Step 3: Build org names map
  const orgIds = Array.from(new Set((memberships || []).map(m => m.org_id)))
  const { data: organizations } = orgIds.length > 0
    ? await supabase.from('organizations').select('id, name').in('id', orgIds)
    : { data: [] }
  const orgNameMap = new Map((organizations || []).map(o => [o.id, o.name]))
  
  // Step 4: Build membership map per user
  const membershipMap = new Map<string, { owner_orgs: { id: string, name: string }[], admin_orgs: { id: string, name: string }[], total_orgs: number }>()
  for (const m of (memberships || [])) {
    if (!membershipMap.has(m.user_id)) {
      membershipMap.set(m.user_id, { owner_orgs: [], admin_orgs: [], total_orgs: 0 })
    }
    const entry = membershipMap.get(m.user_id)!
    const orgName = orgNameMap.get(m.org_id) || 'Без названия'
    if (m.role === 'owner') {
      entry.owner_orgs.push({ id: m.org_id, name: orgName })
    } else if (m.role === 'admin') {
      entry.admin_orgs.push({ id: m.org_id, name: orgName })
    }
    entry.total_orgs++
  }
  
  // Step 5: Build helper maps
  const accountEmailMap = new Map<string, string>()
  const accountActivityMap = new Map<string, string>()
  const tgAccountFromProvider = new Map<string, { tg_user_id: string, username?: string }>()
  accountsData?.forEach(acc => {
    if (acc.provider === 'email' && acc.provider_account_id) {
      accountEmailMap.set(acc.user_id, acc.provider_account_id)
    }
    if (acc.provider === 'telegram' && acc.provider_account_id) {
      tgAccountFromProvider.set(acc.user_id, { tg_user_id: acc.provider_account_id })
    }
    if (acc.updated_at) {
      const current = accountActivityMap.get(acc.user_id)
      if (!current || new Date(acc.updated_at) > new Date(current)) {
        accountActivityMap.set(acc.user_id, acc.updated_at)
      }
    }
  })
  
  const lastLoginMap = new Map<string, string>()
  sessionsData?.forEach(session => {
    if (!lastLoginMap.has(session.user_id)) {
      lastLoginMap.set(session.user_id, session.expires)
    }
  })
  
  const qualificationMap = new Map<string, { responses: any, completed_at: string | null }>()
  qualificationData?.forEach(q => {
    qualificationMap.set(q.user_id, { responses: q.responses, completed_at: q.completed_at })
  })
  
  const tgAccountMap = new Map<string, { telegram_user_id: string, telegram_username: string | null, telegram_first_name: string | null, telegram_last_name: string | null, is_verified: boolean }>()
  telegramAccounts?.forEach(acc => {
    const existing = tgAccountMap.get(acc.user_id)
    if (!existing) {
      tgAccountMap.set(acc.user_id, acc)
    } else {
      // Merge: prefer the entry with the most data (fill in any missing fields)
      tgAccountMap.set(acc.user_id, {
        telegram_user_id: acc.telegram_user_id || existing.telegram_user_id,
        telegram_username: acc.telegram_username || existing.telegram_username,
        telegram_first_name: acc.telegram_first_name || existing.telegram_first_name,
        telegram_last_name: acc.telegram_last_name || existing.telegram_last_name,
        is_verified: acc.is_verified || existing.is_verified,
      })
    }
  })
  
  // Step 6: Groups info for telegram users
  const tgUserIds = Array.from(new Set(
    (telegramAccounts || []).map(acc => acc.telegram_user_id).filter(Boolean)
  ))
  const { data: groupAdmins } = tgUserIds.length > 0
    ? await supabase.from('telegram_group_admins').select('tg_user_id, tg_chat_id').in('tg_user_id', tgUserIds)
    : { data: [] }
  const chatIds = Array.from(new Set((groupAdmins || []).map(ga => ga.tg_chat_id).filter(Boolean)))
  const { data: groups } = chatIds.length > 0
    ? await supabase.from('telegram_groups').select('tg_chat_id, bot_status').in('tg_chat_id', chatIds).eq('bot_status', 'connected')
    : { data: [] }
  const groupsWithBotSet = new Set((groups || []).map(g => g.tg_chat_id))
  
  // Step 7: Format all users
  const formattedUsers = allUsers.map(user => {
    const mData = membershipMap.get(user.id)
    const tgAccount = tgAccountMap.get(user.id)
    const tgFromProvider = tgAccountFromProvider.get(user.id)
    
    const tgUserIdsForUser = tgAccount ? [tgAccount.telegram_user_id] : []
    const groupsAsAdmin = (groupAdmins || []).filter(ga =>
      tgUserIdsForUser.includes(ga.tg_user_id) && groupsWithBotSet.has(ga.tg_chat_id)
    )
    
    const fullName = tgAccount
      ? ([tgAccount.telegram_first_name, tgAccount.telegram_last_name].filter(Boolean).join(' ') || tgAccount.telegram_username || user.name || 'Не указано')
      : (user.name || user.email?.split('@')[0] || 'Не указано')
    
    const telegramUsername = tgAccount?.telegram_username || null
    const telegramUserId = tgAccount?.telegram_user_id || tgFromProvider?.tg_user_id || null
    const telegramDisplayName = telegramUsername
      ? `@${telegramUsername}`
      : (tgAccount ? fullName : null)
    
    const email = user.email || accountEmailMap.get(user.id) || null
    const lastLogin = lastLoginMap.get(user.id) || accountActivityMap.get(user.id) || user.created_at || null
    const qualification = qualificationMap.get(user.id)
    const painPoints = qualification?.responses?.pain_points || []
    
    const hasOrgs = mData && mData.total_orgs > 0
    const hasQualification = !!qualification?.completed_at
    let status: 'active' | 'no_org' | 'incomplete_onboarding'
    if (hasOrgs) {
      status = 'active'
    } else if (hasQualification) {
      status = 'no_org'
    } else {
      status = 'incomplete_onboarding'
    }
    
    return {
      user_id: user.id,
      full_name: fullName,
      email: email || 'N/A',
      is_test: user.is_test || false,
      telegram_verified: tgAccount?.is_verified || false,
      telegram_display_name: telegramDisplayName,
      telegram_username: telegramUsername,
      telegram_user_id: telegramUserId,
      owner_orgs_count: mData?.owner_orgs.length || 0,
      owner_orgs_names: mData?.owner_orgs.map(o => o.name) || [],
      admin_orgs_count: mData?.admin_orgs.length || 0,
      admin_orgs_names: mData?.admin_orgs.map(o => o.name) || [],
      total_orgs_count: mData?.total_orgs || 0,
      groups_with_bot_count: groupsAsAdmin.length,
      last_sign_in_at: lastLogin,
      created_at: user.created_at,
      qualification_completed: hasQualification,
      qualification_role: qualification?.responses?.role || null,
      qualification_community_type: qualification?.responses?.community_type || null,
      qualification_groups_count: qualification?.responses?.groups_count || null,
      qualification_pain_points: Array.isArray(painPoints) ? painPoints : [],
      status,
    }
  }).sort((a, b) => {
    if (a.is_test !== b.is_test) return a.is_test ? 1 : -1
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA
  })
  
  const withOrgs = formattedUsers.filter(u => u.status === 'active').length
  const withoutOrgs = formattedUsers.filter(u => u.status !== 'active').length
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Пользователи</h2>
        <p className="text-gray-600 mt-1">
          Всего {formattedUsers.length} (с орг.: {withOrgs}, без орг.: {withoutOrgs})
        </p>
      </div>
      
      <UsersTable users={formattedUsers} />
    </div>
  )
}
