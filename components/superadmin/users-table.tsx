'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Админ',
  project_manager: 'PM',
  community_manager: 'КМ',
  event_organizer: 'Организатор',
  marketer: 'Маркетолог',
  tech_partner: 'Тех. партнёр',
  hr: 'HR',
  other: 'Другое'
}

const COMMUNITY_TYPE_LABELS: Record<string, string> = {
  professional: 'Профессион.',
  hobby: 'Хобби',
  education: 'Образование',
  client_chats: 'Клиентские',
  business_club: 'Бизнес-клуб',
  brand_community: 'Бренд',
  local_hub: 'Локальный хаб',
  expert_brand: 'Эксперт',
  internal: 'Внутреннее',
  other: 'Другое'
}

const PAIN_POINTS_LABELS: Record<string, string> = {
  missing_messages: 'Пропуск сообщений',
  scattered_tools: 'Разрозненные инструменты',
  fear_of_blocks: 'Страх блокировок',
  event_registration: 'Регистрация на события',
  no_crm: 'Нет CRM',
  no_subscriber_data: 'Нет данных подписчиков',
  low_attendance: 'Низкая посещаемость',
  manual_applications: 'Ручная обработка заявок',
  tracking_inactive: 'Отслеживание неактивных',
  access_management: 'Управление доступом'
}

const STATUS_LABELS: Record<string, { label: string, className: string }> = {
  active: { label: 'Активен', className: 'bg-green-100 text-green-700' },
  no_org: { label: 'Без орг.', className: 'bg-yellow-100 text-yellow-700' },
  incomplete_onboarding: { label: 'Не завершил', className: 'bg-gray-100 text-gray-600' },
}

type FilterTab = 'all' | 'with_orgs' | 'without_orgs'

type User = {
  user_id: string
  full_name: string
  email: string
  is_test: boolean
  telegram_verified: boolean
  telegram_display_name: string | null
  telegram_username: string | null
  telegram_user_id: string | null
  owner_orgs_count: number
  owner_orgs_names: string[]
  admin_orgs_count: number
  admin_orgs_names: string[]
  total_orgs_count: number
  groups_with_bot_count: number
  last_sign_in_at: string | null
  created_at?: string
  qualification_completed: boolean
  qualification_role: string | null
  qualification_community_type: string | null
  qualification_groups_count: string | null
  qualification_pain_points: string[]
  status: 'active' | 'no_org' | 'incomplete_onboarding'
}

function formatLastLogin(dateStr: string | null): string {
  if (!dateStr) return 'Никогда'
  
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  
  const diffDays = Math.floor((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Вчера'
  } else if (diffDays < 7) {
    return `${diffDays} дн. назад`
  } else {
    return date.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    })
  }
}

function TelegramLink({ user }: { user: User }) {
  if (user.telegram_username) {
    return (
      <a
        href={`https://t.me/${user.telegram_username}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`hover:underline ${user.is_test ? '' : 'text-blue-600'}`}
        title={`Открыть @${user.telegram_username} в Telegram`}
      >
        {user.telegram_verified && '✅ '}@{user.telegram_username}
      </a>
    )
  }
  
  if (user.telegram_user_id) {
    return (
      <a
        href={`tg://user?id=${user.telegram_user_id}`}
        className={`hover:underline ${user.is_test ? '' : 'text-blue-600'}`}
        title={`Telegram ID: ${user.telegram_user_id}`}
      >
        {user.telegram_verified && '✅ '}{user.telegram_display_name || `ID:${user.telegram_user_id}`}
      </a>
    )
  }
  
  return <span className="text-gray-400">—</span>
}

export default function UsersTable({ users }: { users: User[] }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [isPending, startTransition] = useTransition()
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)
  const router = useRouter()
  
  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.telegram_username || '').toLowerCase().includes(search.toLowerCase())
    
    const matchesTab = tab === 'all' ||
      (tab === 'with_orgs' && u.status === 'active') ||
      (tab === 'without_orgs' && u.status !== 'active')
    
    return matchesSearch && matchesTab
  })
  
  const handleToggleTest = async (userId: string) => {
    setTogglingUserId(userId)
    try {
      const response = await fetch(`/api/superadmin/users/${userId}/toggle-test`, {
        method: 'POST',
      })
      if (response.ok) {
        startTransition(() => { router.refresh() })
      }
    } catch (error) {
      console.error('Error toggling test status:', error)
    } finally {
      setTogglingUserId(null)
    }
  }

  const tabCounts = {
    all: users.length,
    with_orgs: users.filter(u => u.status === 'active').length,
    without_orgs: users.filter(u => u.status !== 'active').length,
  }
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Поиск по имени, email, telegram..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          {([
            ['all', 'Все'],
            ['with_orgs', 'С орг.'],
            ['without_orgs', 'Без орг.'],
          ] as [FilterTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === key
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label} ({tabCounts[key]})
            </button>
          ))}
        </div>
      </div>
      
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Имя</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Telegram</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Статус</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Орг. (влад/адм)</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Групп</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Квалификация</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Активность</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Тест</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((user) => (
                <tr 
                  key={user.user_id} 
                  className={`hover:bg-neutral-50 ${user.is_test ? 'text-gray-400 bg-gray-50' : ''} ${user.status !== 'active' && !user.is_test ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    {user.full_name}
                    {user.is_test && <span className="ml-2 text-xs">(тест)</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.email !== 'N/A' && !user.email.endsWith('@telegram.user')
                      ? user.email
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <TelegramLink user={user} />
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_LABELS[user.status].className}`}>
                      {STATUS_LABELS[user.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {user.total_orgs_count > 0 ? (
                      <span 
                        className="cursor-help"
                        title={user.owner_orgs_names.length > 0 
                          ? `Владелец:\n${user.owner_orgs_names.join('\n')}${user.admin_orgs_names.length > 0 ? '\n\nАдмин:\n' + user.admin_orgs_names.join('\n') : ''}`
                          : user.admin_orgs_names.length > 0 
                            ? `Админ:\n${user.admin_orgs_names.join('\n')}`
                            : ''}
                      >
                        {user.owner_orgs_count}/{user.admin_orgs_count}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {user.groups_with_bot_count > 0 ? user.groups_with_bot_count : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.qualification_completed ? (
                      <div className="flex flex-wrap gap-1 items-center">
                        {user.qualification_role && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-blue-100 text-blue-700'}`}>
                            {ROLE_LABELS[user.qualification_role] || user.qualification_role}
                          </span>
                        )}
                        {user.qualification_community_type && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-purple-100 text-purple-700'}`}>
                            {COMMUNITY_TYPE_LABELS[user.qualification_community_type] || user.qualification_community_type}
                          </span>
                        )}
                        {user.qualification_groups_count && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-green-100 text-green-700'}`}>
                            {user.qualification_groups_count} групп
                          </span>
                        )}
                        {user.qualification_pain_points.length > 0 && (
                          <span 
                            className={`px-1.5 py-0.5 rounded text-xs cursor-help ${user.is_test ? 'bg-gray-200' : 'bg-red-100 text-red-700'}`}
                            title={`Боли:\n${user.qualification_pain_points.map(p => PAIN_POINTS_LABELS[p] || p).join('\n')}`}
                          >
                            {user.qualification_pain_points.length} боли
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatLastLogin(user.last_sign_in_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <button
                      onClick={() => handleToggleTest(user.user_id)}
                      disabled={togglingUserId === user.user_id || isPending}
                      className={`px-2 py-1 rounded text-xs transition-colors ${
                        user.is_test 
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } disabled:opacity-50`}
                      title={user.is_test ? 'Убрать метку тестового' : 'Пометить как тестового'}
                    >
                      {togglingUserId === user.user_id ? '...' : (user.is_test ? '🧪' : '○')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      <p className="text-sm text-gray-500">
        Показано: {filtered.length} из {users.length}
        {users.filter(u => u.is_test).length > 0 && (
          <span className="ml-2">(тестовых: {users.filter(u => u.is_test).length})</span>
        )}
      </p>
    </div>
  )
}
