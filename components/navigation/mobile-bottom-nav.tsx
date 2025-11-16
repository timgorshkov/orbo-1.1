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
  ChevronRight,
  Building2,
  User as UserIcon,
  Home,
  Eye,
  Grid3x3
} from 'lucide-react'
import { ParticipantAvatar } from '@/components/members/participant-avatar'
import TelegramGroupsNav from '../telegram-groups-nav'

type UserRole = 'owner' | 'admin' | 'member' | 'guest'

function getRolePermissions(role: UserRole) {
  return {
    canViewDashboard: role === 'owner' || role === 'admin',
    canManageTelegram: role === 'owner' || role === 'admin',
    canManageSettings: role === 'owner' || role === 'admin',
    canEditMaterials: role === 'owner' || role === 'admin',
    canViewMaterials: role !== 'guest',
    canCreateEvents: role === 'owner' || role === 'admin',
    canViewEvents: role !== 'guest',
    canRegisterForEvents: role !== 'guest',
    canViewMembers: role !== 'guest',
    canEditMembers: role === 'owner' || role === 'admin',
  }
}

interface MobileBottomNavProps {
  orgId: string
  orgName: string
  orgLogoUrl: string | null
  role: UserRole
  telegramGroups?: any[]
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
  userProfile,
}: MobileBottomNavProps) {
  const pathname = usePathname()
  const { adminMode, toggleAdminMode, isAdmin } = useAdminMode(role)
  const permissions = getRolePermissions(role)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showOrgDropdown, setShowOrgDropdown] = useState(false)

  // Закрываем меню при переходе на другую страницу
  useEffect(() => {
    setIsMenuOpen(false)
  }, [pathname])

  // Основные пункты навигации для нижнего меню
  const mainNavItems = []

  // Определяем видимость пунктов меню
  const showDashboard = isAdmin && adminMode
  const showHome = !isAdmin || !adminMode

  // Динамический первый пункт - Главная или Дашборд
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

  if (permissions.canViewMaterials) {
    mainNavItems.push({
      key: 'materials',
      label: 'Материалы',
      icon: FileText,
      href: `/p/${orgId}/materials`,
      active: pathname?.startsWith(`/p/${orgId}/materials`),
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

  // Дополнительные пункты меню для боковой панели
  const menuItems = []

  // ✅ Apps in dropdown menu for all non-guests
  if (role !== 'guest') {
    menuItems.push({
      key: 'apps',
      label: 'Приложения',
      icon: Grid3x3,
      href: `/p/${orgId}/apps`,
      active: pathname?.startsWith(`/p/${orgId}/apps`),
    })
  }

  // ✅ Settings only in admin mode
  if (permissions.canManageSettings && adminMode) {
    menuItems.push({
      key: 'settings',
      label: 'Настройки',
      icon: Settings,
      href: `/p/${orgId}/settings`,
      active: pathname?.startsWith(`/p/${orgId}/settings`),
    })
  }

  return (
    <>
      {/* Выдвижное меню */}
      {isMenuOpen && (
        <>
          {/* Затемнённый фон */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Само меню */}
          <div className="fixed inset-y-0 right-0 w-80 max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col md:hidden">
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
                    <span className="text-xs text-gray-600">
                      {adminMode ? 'Переключить' : 'Переключить'}
                    </span>
                  </button>
                </div>
              )}

              {/* Дополнительные пункты */}
              <nav className="px-2 py-4 space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        item.active
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}

                {/* ✅ Telegram Groups только для админов в режиме админа */}
                {permissions.canManageTelegram && adminMode && telegramGroups && telegramGroups.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <TelegramGroupsNav orgId={orgId} groups={telegramGroups} currentPath={pathname || ''} />
                  </div>
                )}

                {/* Профиль */}
                <div className="mt-4 pt-4 border-t border-gray-200">
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

                  {/* Смена пространства */}
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

      {/* Нижнее меню */}
      <nav 
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 md:hidden"
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

