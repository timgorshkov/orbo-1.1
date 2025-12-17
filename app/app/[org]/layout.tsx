import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'
import MobileBottomNav from '@/components/navigation/mobile-bottom-nav'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('OrgLayout');

type UserRole = 'owner' | 'admin' | 'member' | 'guest'

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params
  logger.debug({ org_id: orgId }, 'OrgLayout start');
  
  const supabase = await createClientServer()

  // Проверяем авторизацию
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  logger.debug({ 
    user_id: user?.id,
    has_error: !!userError,
    error: userError?.message
  }, 'User auth check');

  // Debug: проверяем cookies
  const { cookies: cookieFn } = await import('next/headers')
  const cookieStore = await cookieFn()
  const allCookies = cookieStore.getAll()
  const authCookies = allCookies.filter(c => c.name.includes('auth'))
  
  logger.debug({ 
    cookies_count: allCookies.length,
    auth_cookies_count: authCookies.length
  }, 'Cookies check');

  if (!user) {
    logger.warn({ org_id: orgId }, 'No user, redirecting to signin');
    redirect('/signin')
  }

  // Используем admin client для проверки организации и membership (обход RLS)
  const adminSupabase = createAdminServer()

  // Получаем информацию об организации
  logger.debug({ org_id: orgId }, 'Fetching organization');
  const { data: org, error: orgError } = await adminSupabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    logger.error({ 
      org_id: orgId,
      error: orgError?.message
    }, 'Organization not found');
    redirect('/orgs')
  }

  // Проверяем членство пользователя через admin client
  logger.debug({ user_id: user.id, org_id: org.id }, 'Fetching membership');
  const { data: membership, error: memberError } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', org.id)
    .maybeSingle()

  // Если нет membership - нет доступа
  if (!membership) {
    logger.warn({ 
      user_id: user.id,
      org_id: org.id
    }, 'No membership found');
    
    const { data: allMemberships } = await adminSupabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
    
    logger.debug({ 
      user_id: user.id,
      memberships_count: allMemberships?.length || 0
    }, 'User memberships check');
    
    redirect('/orgs')
  }

  logger.debug({ 
    user_id: user.id,
    org_id: org.id,
    role: membership.role
  }, 'Membership found');

  const role = membership.role as UserRole

  // Получаем Telegram-группы для админов
  let telegramGroups: any[] = []
  if (role === 'owner' || role === 'admin') {
    logger.debug({ org_id: org.id }, 'Fetching telegram groups');
    
    // Загружаем группы через org_telegram_groups (новая схема many-to-many)
    const { data: orgGroups, error: groupsError } = await adminSupabase
      .from('org_telegram_groups')
      .select(`
        telegram_groups (
          id,
          tg_chat_id,
          title,
          bot_status
        )
      `)
      .eq('org_id', org.id)
    
    if (orgGroups && !groupsError) {
      // Извлекаем telegram_groups из результата JOIN
      telegramGroups = orgGroups
        .map(item => item.telegram_groups)
        .filter(group => group !== null)
        .sort((a: any, b: any) => {
          const titleA = a.title || ''
          const titleB = b.title || ''
          return titleA.localeCompare(titleB)
        })
      
      logger.debug({ 
        org_id: org.id,
        groups_count: telegramGroups.length
      }, 'Loaded telegram groups');
    } else {
      logger.debug({ 
        org_id: org.id,
        error: groupsError?.message
      }, 'No telegram groups found or error occurred');
    }
  }

  // Получаем данные профиля пользователя для отображения в меню
  logger.debug({ user_id: user.id, org_id: org.id }, 'Fetching user profile data');
  
  let userProfile: {
    id: string
    email: string | null
    displayName: string
    photoUrl: string | null
    tgUserId: string | null
    participantId: string | null
  } | undefined

  try {
    // Получаем Telegram аккаунт пользователя для этой организации
    const { data: telegramAccount } = await adminSupabase
      .from('user_telegram_accounts')
      .select('telegram_user_id, telegram_username, telegram_first_name')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .maybeSingle()

    // Получаем профиль участника если есть Telegram
    let participant = null
    if (telegramAccount?.telegram_user_id) {
      const { data: participantData } = await adminSupabase
        .from('participants')
        .select('id, full_name, photo_url, tg_user_id')
        .eq('org_id', org.id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()
      
      participant = participantData
    }

    const displayName = participant?.full_name ||
                       telegramAccount?.telegram_first_name ||
                       user.email?.split('@')[0] ||
                       'Пользователь'

    userProfile = {
      id: user.id,
      email: user.email || null,
      displayName,
      photoUrl: participant?.photo_url || null,
      tgUserId: telegramAccount?.telegram_user_id?.toString() || null,
      participantId: participant?.id || null
    }

    logger.debug({ 
      user_id: user.id,
      display_name: displayName,
      has_photo: !!participant?.photo_url
    }, 'User profile loaded');
  } catch (profileError) {
    logger.error({ 
      user_id: user.id,
      org_id: org.id,
      error: profileError instanceof Error ? profileError.message : String(profileError)
    }, 'Error loading user profile');
    // Continue without profile - sidebar will show fallback
  }

  logger.debug({ org_id: orgId, user_id: user.id }, 'OrgLayout success');

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Боковая панель - только на десктопе */}
      <div className="hidden md:block">
        <CollapsibleSidebar
          orgId={org.id}
          orgName={org.name}
          orgLogoUrl={org.logo_url}
          role={role}
          telegramGroups={telegramGroups}
          userProfile={userProfile}
        />
      </div>

      {/* Основной контент */}
      <main className="flex-1 overflow-y-auto bg-neutral-50 pb-16 md:pb-0">
        {children}
      </main>

      {/* Мобильное нижнее меню - только на мобильных */}
      <MobileBottomNav
        orgId={org.id}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        role={role}
        telegramGroups={telegramGroups}
        userProfile={userProfile}
      />
    </div>
  )
}
