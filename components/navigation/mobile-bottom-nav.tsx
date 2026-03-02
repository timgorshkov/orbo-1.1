'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAdminMode } from '@/lib/hooks/useAdminMode'
import { 
  LayoutDashboard, 
  FileText, 
  Calendar, 
  Users, 
  Menu,
  X,
  Settings,
  Building2,
  User as UserIcon,
  Home,
  Eye,
  AppWindow,
  Bell,
  MessageCircle,
  Radio,
  Megaphone
} from 'lucide-react'
import { ParticipantAvatar } from '@/components/members/participant-avatar'

type UserRole = 'owner' | 'admin' | 'member' | 'guest'

function getRolePermissions(role: UserRole) {
  return {
    canViewDashboard: role === 'owner' || role === 'admin',
    canManageTelegram: role === 'owner' || role === 'admin',
    canManageSettings: role === 'owner' || role === 'admin',
    canViewEvents: role !== 'guest',
    canViewMembers: role !== 'guest',
  }
}

interface MobileBottomNavProps {
  orgId: string
  orgName: string
  orgLogoUrl: string | null
  role: UserRole
  telegramGroups?: any[]
  telegramChannels?: any[]
  maxGroups?: any[]
  userProfile?: {
    id: string
    email: string | null
    displayName: string
    photoUrl: string | null
    tgUserId: string | null
    participantId: string | null
  }
}

export default function MobileBottomNav({
  orgId,
  orgName,
  orgLogoUrl,
  role,
  telegramGroups = [],
  telegramChannels = [],
  maxGroups = [],
  userProfile,
}: MobileBottomNavProps) {
  const pathname = usePathname()
  const { adminMode, toggleAdminMode, isAdmin } = useAdminMode(role)
  const permissions = getRolePermissions(role)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Закрываем меню при переходе на другую страницу
  useEffect(() => {
    setIsMenuOpen(false)
  }, [pathname])

  // Управляем классом на body для helpdesk виджета
  useEffect(() => {
    if (isMenuOpen) {
      document.body.classList.add('mobile-menu-open')
    } else {
      document.body.classList.remove('mobile-menu-open')
    }
    
    return () => {
      document.body.classList.remove('mobile-menu-open')
    }
  }, [isMenuOpen])

  // Основные пункты навигации для нижнего меню
  const mainNavItems = []

  const showDashboard = isAdmin && adminMode
  const showHome = !isAdmin || !adminMode

  if (showHome) {
    mainNavItems.push({
      key: 'home',
      label: 'Главная',
      icon: Home,
      href: `/p/${orgId}`,
      active: pathname === `/p/${orgId}`,
    })
  } else if (showDashboard) {
    mainNavItems.push({
      key: 'dashboard',
      label: 'Дашборд',
      icon: LayoutDashboard,
      href: `/p/${orgId}/dashboard`,
      active: pathname === `/p/${orgId}/dashboard`,
    })
  }

  if (permissions.canManageSettings && adminMode) {
    mainNavItems.push({
      key: 'applications',
      label: 'Заявки',
      icon: FileText,
      href: `/p/${orgId}/applications`,
      active: pathname?.startsWith(`/p/${orgId}/applications`),
    })
  }

  if (permissions.canViewEvents) {
    mainNavItems.push({
      key: 'events',
      label: 'События',
      icon: Calendar,
      href: `/p/${orgId}/events`,
      active: pathname?.startsWith(`/p/${orgId}/events`),
    })
  }

  if (permissions.canViewMembers) {
    mainNavItems.push({
      key: 'members',
      label: 'Участники',
      icon: Users,
      href: `/p/${orgId}/members`,
      active: pathname?.startsWith(`/p/${orgId}/members`),
    })
  }

  return (
    <>
      {/* Выдвижное меню справа — lg:hidden чтобы не показывать на десктопе */}
      {isMenuOpen && (
        <>
          {/* Затемнённый фон */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Само меню */}
          <div className="fixed inset-y-0 right-0 w-80 max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col lg:hidden">
            {/* Шапка меню */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
              <div className="flex items-center gap-3">
                {orgLogoUrl ? (
                  <img
                    src={orgLogoUrl}
                    alt={orgName}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200 text-sm font-bold text-gray-600">
                    {orgName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-semibold text-gray-900 truncate">{orgName}</span>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Контент меню */}
            <div className="flex-1 overflow-y-auto">
              {/* Переключатель режима для админов */}
              {isAdmin && (
                <div className="px-4 py-3 border-b border-gray-200">
                  <button
                    onClick={toggleAdminMode}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <Eye className="h-5 w-5 flex-shrink-0" />
                    <span className="flex-1 text-left">
                      {adminMode ? 'Режим админа' : 'Режим участника'}
                    </span>
                    <span className="text-xs text-gray-600">Переключить</span>
                  </button>
                </div>
              )}

              {/* Дополнительные пункты в порядке: Уведомления → Анонсы → Приложения → Настройки групп → Настройки */}
              <nav className="px-2 py-4 space-y-1">

                {/* Уведомления (только для админов в режиме админа) */}
                {permissions.canManageSettings && adminMode && (
                  <Link
                    href={`/p/${orgId}/notifications`}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      pathname?.startsWith(`/p/${orgId}/notifications`)
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Bell className="h-5 w-5 flex-shrink-0" />
                    <span>Уведомления</span>
                  </Link>
                )}

                {/* Анонсы (только для админов в режиме админа) */}
                {permissions.canManageSettings && adminMode && (
                  <Link
                    href={`/p/${orgId}/announcements`}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      pathname?.startsWith(`/p/${orgId}/announcements`)
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Megaphone className="h-5 w-5 flex-shrink-0" />
                    <span>Анонсы</span>
                  </Link>
                )}

                {/* Приложения (для всех авторизованных) */}
                {role !== 'guest' && (
                  <Link
                    href={`/p/${orgId}/apps`}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      pathname?.startsWith(`/p/${orgId}/apps`)
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <AppWindow className="h-5 w-5 flex-shrink-0" />
                    <span>Приложения</span>
                  </Link>
                )}

                {/* Telegram-группы и каналы (только для админов в режиме админа) */}
                {permissions.canManageTelegram && adminMode && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    {/* Настройки групп — основная ссылка (шестерёнка) */}
                    <Link
                      href={`/p/${orgId}/telegram`}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        pathname === `/p/${orgId}/telegram` || pathname === `/p/${orgId}/telegram/`
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Settings className="h-5 w-5 flex-shrink-0" />
                      <span>Настройки групп</span>
                    </Link>

                    {/* Список групп */}
                    {telegramGroups && telegramGroups.length > 0 && telegramGroups.map((group: any) => (
                      <Link
                        key={group.id}
                        href={`/p/${orgId}/telegram/groups/${group.tg_chat_id}`}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          pathname === `/p/${orgId}/telegram/groups/${group.tg_chat_id}`
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <MessageCircle className="h-4 w-4 flex-shrink-0 ml-1" />
                        <span className="truncate">{group.title}</span>
                      </Link>
                    ))}

                    {/* Список каналов */}
                    {telegramChannels && telegramChannels.length > 0 && telegramChannels.map((channel: any) => (
                      <Link
                        key={channel.id}
                        href={`/p/${orgId}/telegram/channels/${channel.id}`}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          pathname === `/p/${orgId}/telegram/channels/${channel.id}`
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <Radio className="h-4 w-4 flex-shrink-0 ml-1" />
                        <span className="truncate">{channel.title}</span>
                      </Link>
                    ))}

                    {/* MAX группы */}
                    {maxGroups && maxGroups.length > 0 && maxGroups.map((group: any) => (
                      <Link
                        key={`max-${group.id}`}
                        href={`/p/${orgId}/max`}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          pathname?.startsWith(`/p/${orgId}/max`)
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <MessageCircle className="h-4 w-4 flex-shrink-0 ml-1" />
                        <span className="truncate">{group.title || `MAX ${group.max_chat_id}`}</span>
                        <span className="ml-auto text-[10px] font-medium text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded flex-shrink-0">MAX</span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Настройки организации (только для админов в режиме админа) */}
                {permissions.canManageSettings && adminMode && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <Link
                      href={`/p/${orgId}/settings`}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        pathname?.startsWith(`/p/${orgId}/settings`)
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Settings className="h-5 w-5 flex-shrink-0" />
                      <span>Настройки</span>
                    </Link>
                  </div>
                )}

                {/* Профиль и смена пространства */}
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <Link
                    href={`/p/${orgId}/profile`}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-gray-100"
                  >
                    {userProfile && userProfile.displayName ? (
                      <>
                        <ParticipantAvatar
                          participantId={userProfile.participantId || userProfile.id || ''}
                          photoUrl={userProfile.photoUrl || null}
                          tgUserId={userProfile.tgUserId || null}
                          displayName={userProfile.displayName || 'Пользователь'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {userProfile.displayName}
                          </div>
                          {userProfile.email && (
                            <div className="text-xs text-gray-500 truncate">
                              {userProfile.email}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <UserIcon className="h-5 w-5 flex-shrink-0" />
                        <span>Профиль</span>
                      </>
                    )}
                  </Link>

                  <Link
                    href="/orgs"
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-gray-700 hover:bg-gray-100 mt-1"
                  >
                    <Building2 className="h-5 w-5 flex-shrink-0" />
                    <span>Сменить пространство</span>
                  </Link>
                </div>
              </nav>
            </div>
          </div>
        </>
      )}

      {/* Нижняя панель навигации — lg:hidden (показывается до 1024px, как и скрывается сайдбар) */}
      <nav 
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 lg:hidden"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-center justify-around px-2 pt-2 pb-1">
          {mainNavItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[60px] ${
                  item.active
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-6 w-6 flex-shrink-0" />
                <span className="text-[10px] font-medium truncate max-w-full leading-tight">{item.label}</span>
              </Link>
            )
          })}
          
          {/* Кнопка "Меню" */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[60px] ${
              isMenuOpen
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Menu className="h-6 w-6 flex-shrink-0" />
            <span className="text-[10px] font-medium leading-tight">Меню</span>
          </button>
        </div>
      </nav>
    </>
  )
}
