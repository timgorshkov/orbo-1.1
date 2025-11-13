import { ReactNode } from 'react'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'
import MobileBottomNav from '@/components/navigation/mobile-bottom-nav'

type UserRole = 'owner' | 'admin' | 'member' | 'guest'

export default async function PublicOrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params
  
  const supabase = await createClientServer()
  const adminSupabase = createAdminServer()

  // Проверяем авторизацию (но не редиректим - публичные страницы доступны всем)
  const { data: { user } } = await supabase.auth.getUser()

  // Получаем информацию об организации
  const { data: org } = await adminSupabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single()

  if (!org) {
    // Если организация не найдена, просто рендерим детей без навигации
    return <div className="min-h-screen">{children}</div>
  }

  let role: UserRole = 'guest'
  let telegramGroups: any[] = []
  let userProfile: any = null

  // Если пользователь авторизован, определяем его роль
  if (user) {
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .maybeSingle()

    if (membership) {
      role = membership.role as UserRole
    }

    // Получаем Telegram-группы для админов
    if (role === 'owner' || role === 'admin') {
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select(`
          telegram_groups!inner (
            id,
            tg_chat_id,
            title,
            bot_status
          )
        `)
        .eq('org_id', org.id)

      if (orgGroups) {
        telegramGroups = orgGroups
          .map((og: any) => og.telegram_groups)
          .filter((g: any) => g !== null)
      }
    }

    // Получаем профиль участника
    const { data: participant } = await adminSupabase
      .from('participants')
      .select('full_name, username, photo_url')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (participant) {
      userProfile = {
        name: participant.full_name,
        username: participant.username,
        avatarUrl: participant.photo_url
      }
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <CollapsibleSidebar
          orgId={org.id}
          orgName={org.name}
          orgLogoUrl={org.logo_url}
          role={role}
          telegramGroups={telegramGroups}
          userProfile={userProfile}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <div className="lg:hidden">
          <MobileBottomNav
            orgId={org.id}
            orgName={org.name}
            orgLogoUrl={org.logo_url}
            role={role}
            telegramGroups={telegramGroups}
            userProfile={userProfile}
          />
        </div>
      </div>
    </div>
  )
}

