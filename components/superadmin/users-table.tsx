'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

const BOT_MESSAGE_TEMPLATE = `Привет! 👋

Я из команды Orbo. Вижу, что вы недавно зарегистрировались — отлично!

Хотел лично написать, чтобы помочь с запуском. Если есть вопросы по настройке или хотите провести демо — отвечайте сюда или напишите мне напрямую: @orbo_support

С уважением, команда Orbo`

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
  planning: 'Планирует',
  internal: 'Внутреннее',
  other: 'Другое'
}

const PAIN_POINTS_LABELS: Record<string, string> = {
  telegram_blocking: 'Страх блокировки TG',
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

type FilterTab = 'all' | 'with_orgs' | 'without_orgs' | 'with_telegram'

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
  reg_utm_source: string | null
  reg_utm_campaign: string | null
  reg_landing_page: string | null
  reg_from_page: string | null
  reg_device_type: string | null
  reg_referrer: string | null
  reg_partner_code: string | null
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

function TelegramLink({ user, onSendMessage }: { user: User; onSendMessage?: (user: User) => void }) {
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
    const displayName = user.telegram_display_name || user.full_name
    const hasName = displayName && displayName !== 'Не указано'
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap" title={`Telegram ID: ${user.telegram_user_id}`}>
        {user.telegram_verified && '✅ '}
        {hasName && <span className={user.is_test ? '' : 'text-gray-900'}>{displayName}</span>}
        {onSendMessage && (
          <button
            onClick={(e) => { e.stopPropagation(); onSendMessage(user) }}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
            title="Написать от имени бота"
          >
            ✉️ бот
          </button>
        )}
      </span>
    )
  }

  return <span className="text-gray-400">—</span>
}

function SendBotMessageModal({
  user,
  onClose
}: {
  user: User
  onClose: () => void
}) {
  const [message, setMessage] = useState(BOT_MESSAGE_TEMPLATE)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSend = async () => {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/superadmin/send-telegram-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramUserId: user.telegram_user_id,
          message,
        })
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, text: `Сообщение отправлено (через ${data.bot_type || 'бот'})` })
      } else {
        setResult({ ok: false, text: data.error || 'Ошибка отправки' })
      }
    } catch {
      setResult({ ok: false, text: 'Сетевая ошибка' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h3 className="font-semibold text-gray-900">Написать от имени бота</h3>
          <p className="text-sm text-gray-500 mt-1">
            {user.full_name} · ID: {user.telegram_user_id}
            {user.telegram_verified
              ? ' · Telegram верифицирован'
              : ' · Telegram не верифицирован (бот должен быть запущен)'}
          </p>
        </div>
        <div className="p-5 space-y-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Текст сообщения (поддерживается Markdown)"
          />
          <p className="text-xs text-gray-400">Поддерживается Markdown: *жирный*, _курсив_, `код`</p>
          {result && (
            <div className={`text-sm px-3 py-2 rounded-lg ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.text}
            </div>
          )}
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Закрыть
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || result?.ok === true}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UsersTable({ users }: { users: User[] }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [isPending, startTransition] = useTransition()
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)
  const [sendMessageUser, setSendMessageUser] = useState<User | null>(null)
  const router = useRouter()
  
  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.telegram_username || '').toLowerCase().includes(search.toLowerCase())
    
    const matchesTab = tab === 'all' ||
      (tab === 'with_orgs' && u.status === 'active') ||
      (tab === 'without_orgs' && u.status !== 'active') ||
      (tab === 'with_telegram' && !!u.telegram_user_id)
    
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
    with_telegram: users.filter(u => !!u.telegram_user_id).length,
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
            ['with_telegram', 'С контактом'],
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
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Источник</th>
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
                    <TelegramLink
                      user={user}
                      onSendMessage={user.telegram_user_id && !user.telegram_username ? setSendMessageUser : undefined}
                    />
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
                    {user.reg_utm_source || user.reg_utm_campaign || user.reg_landing_page || user.reg_partner_code || user.reg_referrer ? (
                      <div
                        className="flex flex-wrap gap-1 items-center cursor-help"
                        title={[
                          user.reg_partner_code && `Партнёр: ${user.reg_partner_code}`,
                          user.reg_utm_campaign && `utm_campaign: ${user.reg_utm_campaign}`,
                          user.reg_utm_source && `utm_source: ${user.reg_utm_source}`,
                          user.reg_referrer && `Referrer: ${user.reg_referrer}`,
                          user.reg_landing_page && `Лендинг: ${user.reg_landing_page}`,
                          user.reg_from_page && `Страница CTA: ${user.reg_from_page}`,
                          user.reg_device_type && `Устройство: ${user.reg_device_type}`,
                        ].filter(Boolean).join('\n')}
                      >
                        {user.reg_partner_code && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${user.is_test ? 'bg-gray-200' : 'bg-amber-100 text-amber-800'}`}>
                            🤝 {user.reg_partner_code}
                          </span>
                        )}
                        {user.reg_utm_campaign && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-purple-100 text-purple-700'}`}>
                            {user.reg_utm_campaign}
                          </span>
                        )}
                        {user.reg_utm_source && !user.reg_utm_campaign && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-indigo-100 text-indigo-700'}`}>
                            {user.reg_utm_source}
                          </span>
                        )}
                        {user.reg_referrer && !user.reg_partner_code && !user.reg_utm_campaign && !user.reg_utm_source && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-sky-100 text-sky-700'} truncate max-w-[120px]`} title={user.reg_referrer}>
                            {(() => { try { return new URL(user.reg_referrer).hostname } catch { return user.reg_referrer } })()}
                          </span>
                        )}
                        {user.reg_landing_page && !user.reg_partner_code && !user.reg_utm_campaign && !user.reg_utm_source && !user.reg_referrer && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-gray-100 text-gray-600'}`}>
                            {user.reg_landing_page}
                          </span>
                        )}
                        {user.reg_device_type && (
                          <span className={`px-1 py-0.5 rounded text-xs ${user.is_test ? 'bg-gray-200' : 'bg-gray-100 text-gray-600'}`}>
                            {user.reg_device_type === 'mobile' ? '📱' : user.reg_device_type === 'tablet' ? '📱' : '💻'}
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

      {sendMessageUser && (
        <SendBotMessageModal
          user={sendMessageUser}
          onClose={() => setSendMessageUser(null)}
        />
      )}
    </div>
  )
}
