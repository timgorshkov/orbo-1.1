'use client'

import { useState } from 'react'
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

type FilterStatus = 'all' | 'sent' | 'pending' | 'skipped' | 'failed'

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
      return 'Привяжите Telegram-аккаунт, чтобы Orbo заработал в полную силу:\n• Добавите бота в группу — участники начнут появляться в карточках\n• Будете получать уведомления о важных событиях в группе\n• Сможете отправлять анонсы и напоминания от имени бота'
    case 'workspace_ready':
      return 'Аккаунт создан! Вот что стоит сделать первым:\n1. Подключите Telegram-группу — добавьте бота\n2. Создайте событие — MiniApp для регистрации прямо в Telegram\n3. Поделитесь ссылкой — получите первые регистрации'
    case 'add_group':
      return 'Пока группа не подключена, Orbo не видит ваших участников.\n\nПосле подключения:\n• Участники автоматически появятся в карточках\n• Заработает аналитика: кто пишет, кто молчит\n• Можно будет создавать события с анонсами'
    case 'create_event':
      return 'Мероприятие — лучший способ проверить Orbo в деле:\n• MiniApp — регистрация в один тап, не покидая Telegram\n• Напоминания — бот пишет в личку за 24ч и за 1ч\n• Учёт — кто зарегистрировался, оплатил, пришёл'
    case 'video_overview':
      return 'Помимо событий и участников, в Orbo есть:\n• ✨ AI-анализ участников (5 бесплатных)\n• Заявки на вступление — анкета через MiniApp, spam-score\n• Анонсы — бот публикует по расписанию\n• Импорт истории — загрузите чат для аналитики'
    case 'check_in':
      return 'Прошла неделя. Всё получилось?\nЕсли что-то не работает — ответьте на это письмо.\nТелеграм основателя: @timgorshkov'
    default:
      return ''
  }
}

function getTelegramPreview(stepKey: string): string {
  switch (stepKey) {
    case 'workspace_ready':
      return '🏠 аккаунт создан!\n\n1. Подключите Telegram-группу\n2. Создайте событие\n3. Поделитесь ссылкой в группу'
    case 'add_group':
      return '💡 пока нет группы, Orbo не видит участников\n\nДобавьте бота как администратора:\n• Участники появятся в карточках\n• Заработает аналитика\n• Можно создавать события'
    case 'create_event':
      return '🎉 попробуйте создать событие\n\n• MiniApp — регистрация в один тап\n• Бот напомнит за 24ч и за 1ч\n• Кто зарегистрировался, оплатил, пришёл'
    case 'video_overview':
      return '✨ попробуйте AI-анализ\n\n• Оценка здоровья сообщества\n• Конкретные находки\n• Рекомендации на неделю\n\n5 бесплатных анализов'
    case 'check_in':
      return '👋 как дела с Orbo?\n\nПрошла неделя. Если непонятно — напишите.\nТелеграм: @timgorshkov'
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

function getPreview(msg: OnboardingMessage): string {
  if (msg.channel === 'email') {
    return `📧 Тема: ${EMAIL_SUBJECTS[msg.stepKey] || msg.stepKey}\n\n${getEmailPreview(msg.stepKey)}`
  }
  return `📱 Telegram-сообщение:\n\n${getTelegramPreview(msg.stepKey)}`
}

export default function OnboardingTable({ messages }: { messages: OnboardingMessage[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'telegram'>('all')
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null)

  const filtered = messages.filter(m => {
    const matchesSearch = !search ||
      m.userName.toLowerCase().includes(search.toLowerCase()) ||
      m.userEmail.toLowerCase().includes(search.toLowerCase()) ||
      (m.tgUsername || '').toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === 'all' || m.status === statusFilter
    const matchesChannel = channelFilter === 'all' || m.channel === channelFilter

    return matchesSearch && matchesStatus && matchesChannel
  })

  const statusCounts = {
    all: messages.length,
    sent: messages.filter(m => m.status === 'sent').length,
    pending: messages.filter(m => m.status === 'pending').length,
    skipped: messages.filter(m => m.status === 'skipped').length,
    failed: messages.filter(m => m.status === 'failed').length,
  }

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
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Поиск по имени, email, telegram..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs text-xs"
        />

        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          {([
            ['all', 'Все'],
            ['sent', '✅'],
            ['pending', '⏳'],
            ['skipped', '⏭'],
            ['failed', '❌'],
          ] as [FilterStatus, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                statusFilter === key
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label} ({statusCounts[key]})
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          {([
            ['all', 'Все'],
            ['email', '📧 Email'],
            ['telegram', '📱 TG'],
          ] as ['all' | 'email' | 'telegram', string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setChannelFilter(key)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                channelFilter === key
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
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
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-700">Ошибка</th>
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

                  return (
                    <tr
                      key={msg.id}
                      className="hover:bg-blue-50/50 cursor-default"
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
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConf.className}`}>
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {formatDate(msg.scheduledAt)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {formatDate(msg.sentAt)}
                      </td>
                      <td className="px-3 py-2 text-xs text-red-600 max-w-[150px] truncate" title={msg.error || undefined}>
                        {msg.error || '—'}
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
