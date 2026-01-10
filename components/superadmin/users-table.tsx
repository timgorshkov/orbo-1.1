'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

// Маппинг значений квалификации на человекочитаемые названия
const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Админ',
  project_manager: 'PM',
  event_organizer: 'Организатор',
  hr: 'HR',
  other: 'Другое'
}

const COMMUNITY_TYPE_LABELS: Record<string, string> = {
  professional: 'Профессион.',
  hobby: 'Хобби',
  education: 'Образование',
  client_chats: 'Клиентские',
  business_club: 'Бизнес-клуб',
  internal: 'Внутреннее',
  other: 'Другое'
}

type User = {
  user_id: string
  full_name: string
  email: string
  is_test: boolean
  telegram_verified: boolean
  telegram_display_name: string | null
  owner_orgs_count: number
  admin_orgs_count: number
  total_orgs_count: number
  groups_with_bot_count: number
  last_sign_in_at: string | null
  created_at?: string
  qualification_completed: boolean
  qualification_role: string | null
  qualification_community_type: string | null
  qualification_groups_count: string | null
}

function formatLastLogin(dateStr: string | null): string {
  if (!dateStr) return 'Никогда'
  
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  
  const diffDays = Math.floor((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    // Сегодня — показываем время
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Вчера'
  } else if (diffDays < 7) {
    return `${diffDays} дн. назад`
  } else {
    // Показываем дату
    return date.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    })
  }
}

export default function UsersTable({ users }: { users: User[] }) {
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)
  const router = useRouter()
  
  const filtered = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name.toLowerCase().includes(search.toLowerCase())
  )
  
  const handleToggleTest = async (userId: string) => {
    setTogglingUserId(userId)
    try {
      const response = await fetch(`/api/superadmin/users/${userId}/toggle-test`, {
        method: 'POST',
      })
      
      if (response.ok) {
        startTransition(() => {
          router.refresh()
        })
      }
    } catch (error) {
      console.error('Error toggling test status:', error)
    } finally {
      setTogglingUserId(null)
    }
  }
  
  return (
    <div className="space-y-4">
      <Input
        placeholder="Поиск по имени или email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Имя</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Telegram</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Орг. (влад/адм)</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Групп</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Квалификация</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Последняя активность</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Тест</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((user) => (
                <tr 
                  key={user.user_id} 
                  className={`hover:bg-neutral-50 ${user.is_test ? 'text-gray-400 bg-gray-50' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    {user.full_name}
                    {user.is_test && <span className="ml-2 text-xs">(тест)</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.email !== 'N/A' ? user.email : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.telegram_verified ? (
                      <span className={user.is_test ? '' : 'text-green-600'}>
                        ✅ {user.telegram_display_name || ''}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {user.owner_orgs_count}/{user.admin_orgs_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">{user.groups_with_bot_count}</td>
                  <td className="px-4 py-3 text-sm">
                    {user.qualification_completed ? (
                      <div className="flex flex-wrap gap-1">
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
        Всего: {filtered.length} из {users.length}
        {users.filter(u => u.is_test).length > 0 && (
          <span className="ml-2">
            (тестовых: {users.filter(u => u.is_test).length})
          </span>
        )}
      </p>
    </div>
  )
}
