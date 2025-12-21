import { ReactNode } from 'react'
import { createAdminServer } from '@/lib/server/supabaseServer'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'
import MobileBottomNav from '@/components/navigation/mobile-bottom-nav'
import { getUnifiedSession } from '@/lib/auth/unified-auth'

type UserRole = 'owner' | 'admin' | 'member' | 'guest'

export default async function PublicOrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params
  
  // Проверяем авторизацию через unified auth (Supabase или NextAuth)
  const session = await getUnifiedSession();
  const adminSupabase = createAdminServer()

  // Получаем организацию
  const { data: org } = await adminSupabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single()

  // Преобразуем session в объект user для совместимости
  const user = session ? { id: session.user.id, email: session.user.email } : null

  if (!org) {
    // Если организация не найдена, просто рендерим детей без навигации
    return <div className="min-h-screen">{children}</div>
  }

  let role: UserRole = 'guest'
  let telegramGroups: any[] = []
  let userProfile: any = null

  // Если пользователь авторизован, загружаем данные параллельно
  if (user) {
    // ⚡ Параллельные запросы: membership + participant одновременно
    const [membershipResult, participantResult] = await Promise.all([
      adminSupabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', org.id)
        .maybeSingle(),
      adminSupabase
        .from('participants')
        .select('full_name, username, photo_url')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle()
    ])

    if (membershipResult.data) {
      role = membershipResult.data.role as UserRole
    }

    if (participantResult.data) {
      userProfile = {
        name: participantResult.data.full_name,
        username: participantResult.data.username,
        avatarUrl: participantResult.data.photo_url
      }
    }

    // Telegram-группы загружаем только для админов (после определения роли)
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

