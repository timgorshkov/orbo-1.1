'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

type OnboardingMessage = {
  id: string
  userId: string
  userName: string
  userEmail: string
  tgUsername: string | null
  stepKey: string
  channel: 'email' | 'telegram'
  status: 'pending' | 'sent' | 'skipped' | 'failed'
  scheduledAt: string
  sentAt: string | null
  error: string | null
}

type ViewMode = 'current' | 'past'

type DiagnosticData = {
  statusCounts: Record<string, number>
  overdue: { count: number; byStep: Record<string, number>; maxOverdueHours: number }
  failedErrors: Record<string, number>
  lastSentAt: string | null
  cronRunning: boolean
  diagnosis: string[]
}

const STEP_LABELS: Record<string, string> = {
  connect_telegram: 'Подключи TG',
  workspace_ready: 'Аккаунт создан',
  add_group: 'Добавь группу',
  create_event: 'Создай событие',
  video_overview: 'AI и фичи',
  check_in: 'Как дела?',
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  sent: { label: '✅ Отправлено', className: 'bg-green-100 text-green-700' },
  pending: { label: '⏳ Ожидает', className: 'bg-yellow-100 text-yellow-700' },
  skipped: { label: '⏭ Пропущено', className: 'bg-gray-100 text-gray-600' },
  failed: { label: '❌ Ошибка', className: 'bg-red-100 text-red-700' },
}

const EMAIL_SUBJECTS: Record<string, string> = {
  connect_telegram: 'Подключите Telegram — увидьте, кто в вашем сообществе',
  workspace_ready: 'Ваше пространство в Orbo готово — 3 шага до первого события',
  add_group: 'Добавьте группу — участники появятся в карточках',
  create_event: 'Создайте событие — люди регистрируются прямо в Telegram',
  video_overview: 'Что ещё умеет Orbo — AI-анализ и не только',
  check_in: 'Как дела с Orbo? Нужна помощь?',
}

function getEmailPreview(stepKey: string): string {
  switch (stepKey) {
    case 'connect_telegram':
      return 'Привяжите Telegram-аккаунт:\n• Участники начнут появляться в карточках\n• Уведомления о событиях в группе\n• Анонсы и напоминания от имени бота'
    case 'workspace_ready':
      return 'Аккаунт создан! Первые шаги:\n1. Подключите Telegram-группу\n2. Создайте событие — MiniApp в Telegram\n3. Поделитесь ссылкой'
    case 'add_group':
      return 'Пока группа не подключена, Orbo не видит участников.\n• Карточки с именами\n• Аналитика: кто пишет, кто молчит\n• События с анонсами в группу'
    case 'create_event':
      return 'Мероприятие — проверьте Orbo в деле:\n• MiniApp — регистрация в один тап\n• Напоминания за 24ч и за 1ч\n• Учёт регистраций и оплат'
    case 'video_overview':
      return 'Помимо событий:\n• ✨ AI-анализ участников (5 бесплатных)\n• Заявки через MiniApp\n• Анонсы по расписанию\n• Импорт истории чата'
    case 'check_in':
      return 'Прошла неделя. Всё получилось?\nОтветьте на письмо или напишите в Telegram.\n@timgorshkov'
    default:
      return ''
  }
}

function getTelegramPreview(stepKey: string): string {
  switch (stepKey) {
    case 'workspace_ready':
      return '🏠 аккаунт создан!\n1. Подключите группу\n2. Создайте событие\n3. Поделитесь ссылкой'
    case 'add_group':
      return '💡 пока нет группы, Orbo не видит участников\n• Карточки с именами\n• Аналитика\n• События с анонсами'
    case 'create_event':
      return '🎉 попробуйте создать событие\n• MiniApp-регистрация\n• Напоминания за 24ч/1ч\n• Учёт участников'
    case 'video_overview':
      return '✨ AI-анализ сообщества\n• Здоровье сообщества\n• Находки по данным\n• Рекомендации\n5 бесплатных'
    case 'check_in':
      return '👋 как дела с Orbo?\nНапишите мне.\n@timgorshkov'
    default:
      return ''
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function getOverdueHours(scheduledAt: string): number {
  return Math.max(0, (Date.now() - new Date(scheduledAt).getTime()) / (1000 * 60 * 60))
}

function formatOverdue(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} мин.`
  if (hours < 24) return `${Math.round(hours)} ч.`
  return `${Math.round(hours / 24)} дн.`
}

function getPreview(msg: OnboardingMessage): string {
  if (msg.channel === 'email') {
    return `📧 Тема: ${EMAIL_SUBJECTS[msg.stepKey] || msg.stepKey}\n\n${getEmailPreview(msg.stepKey)}`
  }
  return `📱 Telegram:\n\n${getTelegramPreview(msg.stepKey)}`
}

function DiagnosticsBanner({ onProcessed }: { onProcessed: () => void }) {
  const [diag, setDiag] = useState<DiagnosticData | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [processResult, setProcessResult] = useState<string | null>(null)

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/onboarding')
      if (res.ok) setDiag(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchDiagnostics() }, [fetchDiagnostics])

  const handleProcess = async () => {
    setProcessing(true)
    setProcessResult(null)
    try {
      const res = await fetch('/api/superadmin/onboarding', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setProcessResult(`Обработано: ${data.processed} (отправлено: ${data.sent}, пропущено: ${data.skipped}, ошибки: ${data.failed})`)
        await fetchDiagnostics()
        onProcessed()
      } else {
        setProcessResult(`Ошибка: ${data.error}`)
      }
    } catch (e) {
      setProcessResult(`Сетевая ошибка: ${e}`)
    }
    setProcessing(false)
  }

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
    )
  }

  if (!diag) return null

  const hasProblems = diag.diagnosis.length > 0
  const borderColor = diag.overdue.count > 0 && !diag.cronRunning
    ? 'border-red-300 bg-red-50'
    : diag.overdue.count > 0
      ? 'border-yellow-300 bg-yellow-50'
      : 'border-green-300 bg-green-50'

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${borderColor}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Диагностика</h3>
        <div className="flex items-center gap-2">
          {processResult && (
            <span className="text-xs text-gray-600">{processResult}</span>
          )}
          <button
            onClick={handleProcess}
            disabled={processing}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {processing ? 'Обработка...' : 'Запустить отправку вручную'}
          </button>
          <button
            onClick={fetchDiagnostics}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            ↻
          </button>
        </div>
      </div>

      {hasProblems ? (
        <div className="space-y-1">
          {diag.diagnosis.map((line, i) => (
            <p key={i} className="text-xs text-gray-800 whitespace-pre-wrap">{line}</p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-green-700">✅ Проблем не обнаружено</p>
      )}

      <div className="flex gap-4 text-[10px] text-gray-500 pt-1 border-t border-gray-200/50">
        <span>Просрочено: <strong className={diag.overdue.count > 0 ? 'text-red-600' : ''}>{diag.overdue.count}</strong></span>
        <span>Макс. просрочка: <strong>{diag.overdue.maxOverdueHours > 0 ? `${diag.overdue.maxOverdueHours} ч.` : '—'}</strong></span>
        <span>Крон: <strong className={diag.cronRunning ? 'text-green-600' : 'text-red-600'}>{diag.cronRunning ? 'работает' : 'не работает'}</strong></span>
        <span>Последняя отправка: <strong>{diag.lastSentAt ? formatDate(diag.lastSentAt) : 'никогда'}</strong></span>
      </div>
    </div>
  )
}

export default function OnboardingTable({ messages: initialMessages }: { messages: OnboardingMessage[] }) {
  const [messages] = useState(initialMessages)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('current')
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const matchesSearch = (m: OnboardingMessage) =>
    !search ||
    m.userName.toLowerCase().includes(search.toLowerCase()) ||
    m.userEmail.toLowerCase().includes(search.toLowerCase()) ||
    (m.tgUsername || '').toLowerCase().includes(search.toLowerCase())

  const currentMessages = messages
    .filter(m => m.scheduledAt >= cutoff && matchesSearch(m))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))

  const pastMessages = messages
    .filter(m => m.scheduledAt < cutoff && matchesSearch(m))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))

  const filtered = viewMode === 'current' ? currentMessages : pastMessages

  const handleRowEnter = (msg: OnboardingMessage, e: React.MouseEvent<HTMLTableRowElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({
      content: getPreview(msg),
      x: Math.min(rect.left + 20, window.innerWidth - 420),
      y: rect.bottom + 4,
    })
  }

  return (
    <div className="space-y-4">
      <DiagnosticsBanner
        key={refreshKey}
        onProcessed={() => setRefreshKey(k => k + 1)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Поиск по имени, email, telegram..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs text-xs"
        />

        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('current')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'current'
                ? 'bg-white shadow-sm text-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Текущие отправки ({currentMessages.length})
          </button>
          <button
            onClick={() => setViewMode('past')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'past'
                ? 'bg-white shadow-sm text-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Прошедшие ({pastMessages.length})
          </button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-700">Пользователь</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-700 w-12">Канал</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-700">Шаг</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-700">Статус</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-700">Запланировано</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-700">Отправлено</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-700">Проблема</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500 text-sm">
                    Сообщения не найдены
                  </td>
                </tr>
              ) : (
                filtered.map((msg) => {
                  const userName = msg.userName || msg.userEmail?.split('@')[0] || '—'
                  const userLabel = msg.tgUsername
                    ? `${userName} (@${msg.tgUsername})`
                    : msg.userEmail && !msg.userEmail.endsWith('@telegram.user')
                      ? `${userName} · ${msg.userEmail}`
                      : userName

                  const statusConf = STATUS_CONFIG[msg.status]
                  const isOverdue = msg.status === 'pending' && new Date(msg.scheduledAt) < new Date()
                  const overdueH = isOverdue ? getOverdueHours(msg.scheduledAt) : 0

                  let problemText = msg.error || ''
                  if (isOverdue && !problemText) {
                    problemText = `Просрочено ${formatOverdue(overdueH)} — крон не обработал`
                  }

                  return (
                    <tr
                      key={msg.id}
                      className={`cursor-default ${
                        isOverdue
                          ? 'bg-red-50/60 hover:bg-red-50'
                          : msg.status === 'failed'
                            ? 'bg-red-50/40 hover:bg-red-50/60'
                            : 'hover:bg-blue-50/50'
                      }`}
                      onMouseEnter={(e) => handleRowEnter(msg, e)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <td className="px-3 py-2 text-xs text-gray-900 max-w-[220px] truncate" title={userLabel}>
                        {userLabel}
                      </td>
                      <td className="px-3 py-2 text-center text-xs">
                        {msg.channel === 'email' ? '📧' : '📱'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-medium text-gray-900">{STEP_LABELS[msg.stepKey] || msg.stepKey}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isOverdue ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                            🔴 Просрочено
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConf.className}`}>
                            {statusConf.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {formatDate(msg.scheduledAt)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {formatDate(msg.sentAt)}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={problemText || undefined}>
                        {isOverdue ? (
                          <span className="text-red-600 font-medium">Просрочено {formatOverdue(overdueH)}</span>
                        ) : msg.error ? (
                          <span className="text-red-600">{msg.error}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 max-w-sm bg-gray-900 text-gray-100 text-xs rounded-lg px-4 py-3 shadow-xl whitespace-pre-wrap leading-relaxed pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Показано: {filtered.length} из {messages.length}
      </p>
    </div>
  )
}
