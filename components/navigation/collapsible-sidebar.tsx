'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAdminMode } from '@/lib/hooks/useAdminMode'
import TelegramGroupsNav from '../telegram-groups-nav'
import { 
  LayoutDashboard, 
  FileText, 
  Calendar, 
  Users, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Building2,
  User as UserIcon,
  AppWindow,
  Home,
  Megaphone,
  Eye,
  MessageCircle,
  Bell
} from 'lucide-react'
import { ParticipantAvatar } from '@/components/members/participant-avatar'

type UserRole = 'owner' | 'admin' | 'member' | 'guest'

interface WhatsAppGroup {
  id: string
  group_name: string | null
  messages_imported: number
}

interface CollapsibleSidebarProps {
  orgId: string
  orgName: string
  orgLogoUrl: string | null
  role: UserRole
  telegramGroups?: any[]
  userProfile?: {
    name?: string
    username?: string
    avatarUrl?: string | null
  } | {
    id: string
    email: string | null
    displayName: string
    photoUrl: string | null
    tgUserId: string | null
    participantId: string | null
  }
}

export default function CollapsibleSidebar({
  orgId,
  orgName,
  orgLogoUrl,
  role,
  telegramGroups = [],
  userProfile,
}: CollapsibleSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { adminMode, toggleAdminMode, isAdmin } = useAdminMode(role)

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showOrgDropdown, setShowOrgDropdown] = useState(false)
  const [showMenuDropdown, setShowMenuDropdown] = useState(false)
  const [showTelegramDropdown, setShowTelegramDropdown] = useState(false)
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[]>([])

  // Сохраняем состояние свёрнутости в localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`sidebar-collapsed-${orgId}`)
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [orgId])
  
  // Загружаем WhatsApp группы, отмеченные для показа в меню
  useEffect(() => {
    async function loadWhatsAppGroups() {
      try {
        const res = await fetch(`/api/whatsapp/menu-groups?orgId=${orgId}`)
        if (res.ok) {
          const data = await res.json()
          setWhatsappGroups(data.groups || [])
        }
      } catch (error) {
        console.error('Failed to load WhatsApp groups:', error)
      }
    }
    
    if (isAdmin && adminMode) {
      loadWhatsAppGroups()
    }
  }, [orgId, isAdmin, adminMode])

  const toggleSidebar = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem(`sidebar-collapsed-${orgId}`, String(newState))
  }

  // Определяем видимость пунктов меню
  const showDashboard = isAdmin && adminMode
  const showHome = !isAdmin || !adminMode

  // Навигационные элементы (основная панель - без dropdown)
  const navItems = []

  // Динамический первый пункт
  if (showHome) {
    navItems.push({
      key: 'home',
      label: 'Главная',
      icon: Home,
      href: `/p/${orgId}`,
      active: pathname === `/p/${orgId}`,
    })
  } else if (showDashboard) {
    navItems.push({
      key: 'dashboard',
      label: 'Дашборд',
      icon: LayoutDashboard,
      href: `/p/${orgId}/dashboard`,
      active: pathname === `/p/${orgId}/dashboard`,
    })
  }

  // Уведомления (для админов в режиме админа, после дашборда)
  if (isAdmin && adminMode) {
    navItems.push({
      key: 'notifications',
      label: 'Уведомления',
      icon: Bell,
      href: `/p/${orgId}/notifications`,
      active: pathname?.startsWith(`/p/${orgId}/notifications`),
    })
  }

  // Материалы (для всех, кроме guest)
  if (role !== 'guest') {
    navItems.push({
      key: 'materials',
      label: 'Материалы',
      icon: FileText,
      href: `/p/${orgId}/materials`,
      active: pathname?.startsWith(`/p/${orgId}/materials`),
    })
  }

  // События (для всех, кроме guest)
  if (role !== 'guest') {
    navItems.push({
      key: 'events',
      label: 'События',
      icon: Calendar,
      href: `/p/${orgId}/events`,
      active: pathname?.startsWith(`/p/${orgId}/events`),
    })
  }

  // Анонсы (только для owner и admin в режиме админа)
  if (isAdmin && adminMode) {
    navItems.push({
      key: 'announcements',
      label: 'Анонсы',
      icon: Megaphone,
      href: `/p/${orgId}/announcements`,
      active: pathname?.startsWith(`/p/${orgId}/announcements`),
    })
  }

  // Участники (для всех, кроме guest)
  if (role !== 'guest') {
    navItems.push({
      key: 'members',
      label: 'Участники',
      icon: Users,
      href: `/p/${orgId}/members`,
      active: pathname?.startsWith(`/p/${orgId}/members`),
    })
  }

  if (isCollapsed) {
    // Свёрнутая панель (только иконки)
    return (
      <aside className="flex h-screen w-16 flex-col border-r border-gray-200 bg-white">
        {/* Лого организации */}
        <div
          className="flex h-16 items-center justify-center border-b border-gray-200 cursor-pointer hover:bg-gray-50"
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          title={orgName}
        >
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
        </div>

        {/* Основная навигация */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex h-12 items-center justify-center rounded-lg transition-colors ${
                  item.active
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={item.label}
              >
                <Icon className="h-5 w-5" />
              </Link>
            )
          })}
        </nav>

        {/* Кнопка разворачивания и dropdown меню */}
        <div className="border-t border-gray-200 p-2 space-y-1 relative">
          <button
            onClick={() => setShowMenuDropdown(!showMenuDropdown)}
            className={`flex h-12 w-full items-center justify-center rounded-lg transition-colors ${
              showMenuDropdown
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Меню"
          >
            <ChevronDown className="h-5 w-5" />
          </button>

          {/* Dropdown меню (collapsed mode) */}
          {showMenuDropdown && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowMenuDropdown(false)}
              />
              <div className="absolute bottom-14 left-16 z-20 w-64 rounded-lg border border-gray-200 bg-white shadow-lg py-2">
                <Link
                  href={`/p/${orgId}/apps`}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowMenuDropdown(false)}
                >
                  <AppWindow className="h-4 w-4" />
                  <span>Приложения</span>
                </Link>

                {/* Группы мессенджеров (только для админов) */}
                {isAdmin && adminMode && (
                  <div className="border-t border-gray-100 my-1 pt-1">
                    <button
                      onClick={() => setShowTelegramDropdown(!showTelegramDropdown)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Группы</span>
                      <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showTelegramDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showTelegramDropdown && (
                      <div className="pl-6">
                        {telegramGroups.length > 0 || whatsappGroups.length > 0 ? (
                          <>
                            {telegramGroups.map((group: any) => (
                              <Link
                                key={group.id}
                                href={`/p/${orgId}/telegram/groups/${group.tg_chat_id}`}
                                className="block px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                onClick={() => setShowMenuDropdown(false)}
                              >
                                {group.title}
                              </Link>
                            ))}
                            {whatsappGroups.map((group) => (
                              <Link
                                key={`wa-${group.id}`}
                                href={`/p/${orgId}/telegram/whatsapp/${group.id}`}
                                className="block px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                onClick={() => setShowMenuDropdown(false)}
                              >
                                {group.group_name || 'WhatsApp чат'}
                              </Link>
                            ))}
                          </>
                        ) : (
                          <div className="px-4 py-1.5 text-sm text-gray-500 italic">
                            Нет подключенных групп
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Настройки (только для админов) */}
                {isAdmin && adminMode && (
                  <>
                    <div className="border-t border-gray-100 my-1"></div>
                    <Link
                      href={`/p/${orgId}/settings`}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setShowMenuDropdown(false)}
                    >
                      <Settings className="h-4 w-4" />
                      <span>Настройки</span>
                    </Link>
                  </>
                )}

                {/* Переключатель режима (только для админов) */}
                {isAdmin && (
                  <>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button
                      onClick={() => {
                        toggleAdminMode()
                        setShowMenuDropdown(false)
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full"
                    >
                      <Eye className="h-4 w-4" />
                      <span>Режим участника</span>
                      <div className={`ml-auto w-9 h-5 rounded-full transition-colors ${adminMode ? 'bg-gray-300' : 'bg-blue-600'}`}>
                        <div className={`w-4 h-4 mt-0.5 rounded-full bg-white transition-transform ${adminMode ? 'ml-0.5' : 'ml-4'}`}></div>
                      </div>
                    </button>
                  </>
                )}

                <div className="border-t border-gray-100 my-1"></div>
                <Link
                  href={`/p/${orgId}/profile`}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowMenuDropdown(false)}
                >
                  {userProfile ? (
                    <>
                      {'avatarUrl' in userProfile && userProfile.avatarUrl ? (
                        <img
                          src={userProfile.avatarUrl}
                          alt={userProfile.name || 'User'}
                          className="h-4 w-4 rounded-full object-cover"
                        />
                      ) : 'photoUrl' in userProfile && userProfile.photoUrl ? (
                        <img
                          src={userProfile.photoUrl}
                          alt={'displayName' in userProfile ? userProfile.displayName : 'User'}
                          className="h-4 w-4 rounded-full object-cover"
                        />
                      ) : (
                        <UserIcon className="h-4 w-4" />
                      )}
                      <span>
                        {'name' in userProfile ? userProfile.name || userProfile.username : 
                         'displayName' in userProfile ? userProfile.displayName : 'Профиль'}
                      </span>
                    </>
                  ) : (
                    <>
                      <UserIcon className="h-4 w-4" />
                      <span>Профиль</span>
                    </>
                  )}
                </Link>
              </div>
            </>
          )}
          
          <button
            onClick={toggleSidebar}
            className="flex h-12 w-full items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            title="Развернуть меню"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </aside>
    )
  }

  // Развёрнутая панель (иконки + текст)
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Шапка с лого и названием + dropdown */}
      <div className="relative flex h-16 items-center border-b border-gray-200 px-4">
        <button
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          className="flex items-center gap-3 flex-1 hover:opacity-80 rounded-lg p-2 -ml-2 hover:bg-gray-50"
        >
          {orgLogoUrl ? (
            <img
              src={orgLogoUrl}
              alt={orgName}
              className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200 text-sm font-bold text-gray-600 flex-shrink-0">
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-semibold text-gray-900 truncate flex-1 text-left max-w-[140px]" title={orgName}>{orgName}</span>
          <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown menu */}
        {showOrgDropdown && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowOrgDropdown(false)}
            />
            <div className="absolute left-4 right-4 top-full mt-2 z-20 rounded-lg border border-gray-200 bg-white shadow-lg py-2">
              <Link
                href="/orgs"
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setShowOrgDropdown(false)}
              >
                <Building2 className="h-4 w-4" />
                <span>Сменить пространство</span>
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Основная навигация */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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

        {/* Приложения (для всех авторизованных) */}
        <Link
          href={`/p/${orgId}/apps`}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname?.startsWith(`/p/${orgId}/apps`)
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <AppWindow className="h-5 w-5 flex-shrink-0" />
          <span>Приложения</span>
        </Link>

        {/* Группы мессенджеров (только для админов в режиме админа) */}
        {isAdmin && adminMode && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Группы
              </div>
              <Link
                href={`/p/${orgId}/telegram`}
                className="p-1 rounded hover:bg-gray-100"
                title="Настройки Telegram"
              >
                <Settings className="h-4 w-4 text-gray-500" />
              </Link>
            </div>
            {/* Объединённый список всех групп (Telegram + WhatsApp) */}
            {telegramGroups.length > 0 || whatsappGroups.length > 0 ? (
              <>
                {telegramGroups.map((group: any) => (
                  <Link
                    key={group.id}
                    href={`/p/${orgId}/telegram/groups/${group.tg_chat_id}`}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      pathname === `/p/${orgId}/telegram/groups/${group.tg_chat_id}`
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <MessageCircle className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{group.title}</span>
                  </Link>
                ))}
                {whatsappGroups.map((group) => (
                  <Link
                    key={`wa-${group.id}`}
                    href={`/p/${orgId}/telegram/whatsapp/${group.id}`}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      pathname === `/p/${orgId}/telegram/whatsapp/${group.id}`
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <MessageCircle className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{group.group_name || 'WhatsApp чат'}</span>
                  </Link>
                ))}
              </>
            ) : (
              <div className="px-3 py-1.5 text-sm text-gray-500 italic">
                Нет подключенных групп
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Футер с прямыми ссылками (без dropdown) */}
      <div className="border-t border-gray-200 p-2 space-y-1">
        {/* Настройки (только для админов в режиме админа) */}
        {isAdmin && adminMode && (
          <Link
            href={`/p/${orgId}/settings`}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname?.startsWith(`/p/${orgId}/settings`)
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Settings className="h-5 w-5 flex-shrink-0" />
            <span>Настройки</span>
          </Link>
        )}

        {/* Переключатель режима (только для админов) */}
        {isAdmin && (
          <button
            onClick={toggleAdminMode}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            <Eye className="h-5 w-5 flex-shrink-0" />
            <span>Режим участника</span>
            <div className={`ml-auto w-9 h-5 rounded-full transition-colors ${adminMode ? 'bg-gray-300' : 'bg-blue-600'}`}>
              <div className={`w-4 h-4 mt-0.5 rounded-full bg-white transition-transform ${adminMode ? 'ml-0.5' : 'ml-4'}`}></div>
            </div>
          </button>
        )}

        {/* Профиль */}
        <Link
          href={`/p/${orgId}/profile`}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
        >
          {userProfile ? (
            <>
              {'avatarUrl' in userProfile && userProfile.avatarUrl ? (
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.name || 'User'}
                  className="h-5 w-5 rounded-full object-cover flex-shrink-0"
                />
              ) : 'photoUrl' in userProfile && userProfile.photoUrl ? (
                <img
                  src={userProfile.photoUrl}
                  alt={'displayName' in userProfile ? userProfile.displayName : 'User'}
                  className="h-5 w-5 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <UserIcon className="h-5 w-5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {'name' in userProfile ? userProfile.name || userProfile.username : 
                   'displayName' in userProfile ? userProfile.displayName : 'Профиль'}
                </div>
              </div>
            </>
          ) : (
            <>
              <UserIcon className="h-5 w-5 flex-shrink-0" />
              <span>Профиль</span>
            </>
          )}
        </Link>

        {/* Свернуть меню */}
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft className="h-5 w-5 flex-shrink-0" />
          <span>Свернуть меню</span>
        </button>
      </div>
    </aside>
  )
}
