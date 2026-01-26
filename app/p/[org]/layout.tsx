import { ReactNode } from 'react'
import { createAdminServer } from '@/lib/server/supabaseServer'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'
import MobileBottomNav from '@/components/navigation/mobile-bottom-nav'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { logger } from '@/lib/logger'

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
      // Получаем связи org -> telegram_groups
      const { data: orgGroupLinks } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', org.id)

      if (orgGroupLinks && orgGroupLinks.length > 0) {
        const chatIds = orgGroupLinks.map(link => link.tg_chat_id);
        
        // Получаем данные telegram_groups
        const { data: groups } = await adminSupabase
          .from('telegram_groups')
          .select('id, tg_chat_id, title, bot_status')
          .in('tg_chat_id', chatIds)

        if (groups) {
          telegramGroups = groups;
        }
      }
    }
  }

  // Load telegram channels (two separate queries for PostgreSQL compatibility)
  let telegramChannels: any[] = [];
  if (role === 'owner' || role === 'admin') {
    // Step 1: Get channel links for this org
    const { data: channelLinks, error: linksError } = await adminSupabase
      .from('org_telegram_channels')
      .select('channel_id, is_primary')
      .eq('org_id', org.id);
    
    if (linksError) {
      logger.error({ error: linksError, org_id: org.id }, 'Failed to load telegram channel links');
    }
    
    // Step 2: Get channel details if we have links
    if (!linksError && channelLinks && channelLinks.length > 0) {
      const channelIds = channelLinks.map((link: any) => link.channel_id);
      
      const { data: channels, error: channelsError } = await adminSupabase
        .from('telegram_channels')
        .select('id, tg_chat_id, title, username, bot_status')
        .in('id', channelIds);
      
      if (channelsError) {
        logger.error({ error: channelsError, org_id: org.id }, 'Failed to load telegram channels');
      }
      
      if (!channelsError && channels) {
        // Create a map for quick lookup
        const linksMap = new Map(channelLinks.map((link: any) => [link.channel_id, link.is_primary]));
        
        // Combine data
        telegramChannels = channels
          .map((ch: any) => ({
            id: ch.id,
            tg_chat_id: ch.tg_chat_id,
            title: ch.title,
            username: ch.username,
            bot_status: ch.bot_status,
            is_primary: linksMap.get(ch.id) || false
          }))
          .sort((a: any, b: any) => {
            const titleA = a.title || '';
            const titleB = b.title || '';
            return titleA.localeCompare(titleB);
          });
        
        logger.debug({ org_id: org.id, channels_count: telegramChannels.length }, 'Loaded telegram channels');
      }
    }
  }

  // Use key to force remount when organization changes, preventing React DOM mismatch errors
  return (
    <div key={`org-layout-${org.id}`} className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <CollapsibleSidebar
          orgId={org.id}
          orgName={org.name}
          orgLogoUrl={org.logo_url}
          role={role}
          telegramGroups={telegramGroups}
          telegramChannels={telegramChannels}
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
            telegramChannels={telegramChannels}
            userProfile={userProfile}
          />
        </div>
      </div>
    </div>
  )
}

