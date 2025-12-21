import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'
import MobileBottomNav from '@/components/navigation/mobile-bottom-nav'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedSession } from '@/lib/auth/unified-auth'

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
  
  // Проверяем авторизацию через unified auth (Supabase или NextAuth)
  const session = await getUnifiedSession();
  const adminSupabase = createAdminServer()

  // Получаем организацию
  const { data: org, error: orgError } = await adminSupabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single()

  logger.debug({ 
    user_id: session?.user?.id,
    provider: session?.provider,
  }, 'User auth check');

  if (!session) {
    logger.warn({ org_id: orgId }, 'No user, redirecting to signin');
    redirect('/signin')
  }

  const user = { id: session.user.id, email: session.user.email };

  if (orgError || !org) {
    logger.error({ 
      org_id: orgId,
      error: orgError?.message
    }, 'Organization not found');
    redirect('/orgs')
  }

  // ⚡ Параллельные запросы: membership + telegram account одновременно
  const [membershipResult, telegramAccountResult] = await Promise.all([
    adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .maybeSingle(),
    adminSupabase
      .from('user_telegram_accounts')
      .select('telegram_user_id, telegram_username, telegram_first_name')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .maybeSingle()
  ])

  const membership = membershipResult.data
  const telegramAccount = telegramAccountResult.data

  // Если нет membership - нет доступа
  if (!membership) {
    logger.warn({ 
      user_id: user.id,
      org_id: org.id
    }, 'No membership found');
    redirect('/orgs')
  }

  logger.debug({ 
    user_id: user.id,
    org_id: org.id,
    role: membership.role
  }, 'Membership found');

  const role = membership.role as UserRole

  // ⚡ Параллельные запросы: telegram groups (для админов) + participant
  let telegramGroups: any[] = []
  let participant: any = null

  // Собираем все запросы для параллельного выполнения
  const groupsPromise = (role === 'owner' || role === 'admin')
    ? adminSupabase
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
    : Promise.resolve({ data: null, error: null })

  const participantPromise = telegramAccount?.telegram_user_id
    ? adminSupabase
        .from('participants')
        .select('id, full_name, photo_url, tg_user_id')
        .eq('org_id', org.id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null })

  const [groupsResult, participantResult] = await Promise.all([
    groupsPromise,
    participantPromise
  ])

  if (groupsResult.data && !groupsResult.error) {
    telegramGroups = groupsResult.data
      .map((item: any) => item.telegram_groups)
      .filter((group: any) => group !== null)
      .sort((a: any, b: any) => {
        const titleA = a.title || ''
        const titleB = b.title || ''
        return titleA.localeCompare(titleB)
      })
    
    logger.debug({ 
      org_id: org.id,
      groups_count: telegramGroups.length
    }, 'Loaded telegram groups');
  }

  participant = participantResult.data

  // Формируем профиль пользователя
  const displayName = participant?.full_name ||
                     telegramAccount?.telegram_first_name ||
                     user.email?.split('@')[0] ||
                     'Пользователь'

  const userProfile = {
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
