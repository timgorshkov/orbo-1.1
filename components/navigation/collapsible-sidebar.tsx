'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  Building2
} from 'lucide-react'

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

interface CollapsibleSidebarProps {
  orgId: string
  orgName: string
  orgLogoUrl: string | null
  role: UserRole
  telegramGroups?: any[]
}

export default function CollapsibleSidebar({
  orgId,
  orgName,
  orgLogoUrl,
  role,
  telegramGroups = [],
}: CollapsibleSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const permissions = getRolePermissions(role)

  // Определяем начальное состояние панели (по умолчанию развернута для всех)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showOrgDropdown, setShowOrgDropdown] = useState(false)

  // Сохраняем состояние в localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`sidebar-collapsed-${orgId}`)
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [orgId])

  const toggleSidebar = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem(`sidebar-collapsed-${orgId}`, String(newState))
  }

  // Навигационные элементы в зависимости от роли
  const navItems = []

  if (permissions.canViewDashboard) {
    navItems.push({
      key: 'dashboard',
      label: 'Дашборд',
      icon: LayoutDashboard,
      href: `/app/${orgId}/dashboard`,
      active: pathname === `/app/${orgId}/dashboard`,
    })
  }

  if (permissions.canViewMaterials) {
    navItems.push({
      key: 'materials',
      label: 'Материалы',
      icon: FileText,
      href: `/app/${orgId}/materials`,
      active: pathname?.startsWith(`/app/${orgId}/materials`),
    })
  }

  if (permissions.canViewEvents) {
    navItems.push({
      key: 'events',
      label: 'События',
      icon: Calendar,
      href: `/app/${orgId}/events`,
      active: pathname?.startsWith(`/app/${orgId}/events`),
    })
  }

  if (permissions.canViewMembers) {
    navItems.push({
      key: 'members',
      label: 'Участники',
      icon: Users,
      href: `/app/${orgId}/members`,
      active: pathname?.startsWith(`/app/${orgId}/members`),
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

        {/* Кнопка разворачивания и настройки */}
        <div className="border-t border-gray-200 p-2 space-y-1">
          {permissions.canManageSettings && (
            <Link
              href={`/app/${orgId}/settings`}
              className={`flex h-12 items-center justify-center rounded-lg transition-colors ${
                pathname?.startsWith(`/app/${orgId}/settings`)
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Настройки"
            >
              <Settings className="h-5 w-5" />
            </Link>
          )}
          
          <button
            onClick={async () => {
              if (confirm('Вы уверены, что хотите выйти?')) {
                try {
                  await fetch('/api/auth/logout', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                  })
                  window.location.href = '/signin'
                } catch (error) {
                  console.error('Logout error:', error)
                  window.location.href = '/signin'
                }
              }
            }}
            className="flex h-12 w-full items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            title="Выйти"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
          
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
          <span className="font-semibold text-gray-900 truncate flex-1 text-left">{orgName}</span>
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

        {/* Для админов показываем секцию Telegram Groups */}
        {permissions.canManageTelegram && (
          <div className="mt-6">
            <TelegramGroupsNav orgId={orgId} groups={telegramGroups} />
          </div>
        )}
      </nav>

      {/* Футер с кнопками */}
      <div className="border-t border-gray-200 p-2 space-y-1">
        {permissions.canManageSettings && (
          <Link
            href={`/app/${orgId}/settings`}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname?.startsWith(`/app/${orgId}/settings`)
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Settings className="h-5 w-5 flex-shrink-0" />
            <span>Настройки</span>
          </Link>
        )}

        <button
          onClick={async () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
              try {
                await fetch('/api/auth/logout', { 
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({})
                })
                window.location.href = '/signin'
              } catch (error) {
                console.error('Logout error:', error)
                window.location.href = '/signin'
              }
            }
          }}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
        >
          <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Выйти</span>
        </button>

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
