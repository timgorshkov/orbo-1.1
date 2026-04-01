'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Archive, ArchiveRestore, Loader2, LogIn } from 'lucide-react'
import Link from 'next/link'

type Organization = {
  id: string
  name: string
  owner_email: string | null
  owner_name: string | null
  created_at: string
  status: string
  archived_at?: string | null
  has_telegram: boolean
  telegram_verified: boolean
  telegram_username: string | null
  telegram_display_name: string | null
  telegram_user_id: string | null
  has_max: boolean
  groups_with_bot: number
  participants_count: number
  events_count: number
  last_activity: string | null
  reg_utm_campaign: string | null
  reg_utm_source: string | null
  reg_referrer: string | null
  reg_landing_page: string | null
  reg_device_type: string | null
  reg_partner_code: string | null
}

interface OrganizationsTableProps {
  organizations: Organization[]
  archivedOrganizations?: Organization[]
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

const BOT_MESSAGE_TEMPLATE = `Привет! 👋

Я из команды Orbo. Вижу, что вы недавно зарегистрировались — отлично!

Хотел лично написать, чтобы помочь с запуском. Если есть вопросы по настройке или хотите провести демо — отвечайте сюда или напишите мне напрямую: @orbo_support

С уважением, команда Orbo`

function SendBotMessageModal({ telegramUserId, displayName, onClose }: {
  telegramUserId: string
  displayName: string
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
        body: JSON.stringify({ telegramUserId, message })
      })
      const data = await res.json()
      setResult(res.ok
        ? { ok: true, text: `Сообщение отправлено (через ${data.bot_type || 'бот'})` }
        : { ok: false, text: data.error || 'Ошибка отправки' })
    } catch {
      setResult({ ok: false, text: 'Сетевая ошибка' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h3 className="font-semibold text-gray-900">Написать от имени бота</h3>
          <p className="text-sm text-gray-500 mt-1">{displayName} · ID: {telegramUserId}</p>
        </div>
        <div className="p-5 space-y-3">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
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

type FilterMode = 'all' | 'with_participants' | 'active_2d'

export default function OrganizationsTable({
  organizations,
  archivedOrganizations = []
}: OrganizationsTableProps) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ id: string; name: string; action: 'archive' | 'unarchive' } | null>(null)
  const [sendMessage, setSendMessage] = useState<{ telegramUserId: string; displayName: string } | null>(null)

  const now = Date.now()
  const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000

  const displayOrgs = showArchived ? archivedOrganizations : organizations

  const filtered = displayOrgs.filter(org => {
    if (search && !org.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterMode === 'with_participants' && org.participants_count < 1) return false
    if (filterMode === 'active_2d') {
      if (!org.last_activity) return false
      if (new Date(org.last_activity).getTime() < twoDaysAgo) return false
    }
    return true
  })

  const handleArchive = async (org: Organization) => {
    setConfirmDialog({ id: org.id, name: org.name, action: 'archive' })
  }

  const handleUnarchive = async (org: Organization) => {
    setConfirmDialog({ id: org.id, name: org.name, action: 'unarchive' })
  }

  const confirmAction = async () => {
    if (!confirmDialog) return

    setLoadingId(confirmDialog.id)
    try {
      const response = await fetch(`/api/superadmin/organizations/${confirmDialog.id}/archive`, {
        method: confirmDialog.action === 'archive' ? 'POST' : 'DELETE'
      })

      if (response.ok) {
        window.location.reload()
      } else {
        const data = await response.json()
        alert(`Ошибка: ${data.error || 'Неизвестная ошибка'}`)
      }
    } catch {
      alert('Ошибка сети')
    } finally {
      setLoadingId(null)
      setConfirmDialog(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs, Filters and Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <Button
            variant={!showArchived ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowArchived(false)}
          >
            Активные ({organizations.length})
          </Button>
          <Button
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowArchived(true)}
          >
            <Archive className="h-4 w-4 mr-1" />
            Архив ({archivedOrganizations.length})
          </Button>
        </div>

        {!showArchived && (
          <div className="flex gap-1.5">
            <Button
              variant={filterMode === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterMode('all')}
            >
              Все
            </Button>
            <Button
              variant={filterMode === 'with_participants' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterMode('with_participants')}
            >
              С участниками
            </Button>
            <Button
              variant={filterMode === 'active_2d' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterMode('active_2d')}
            >
              Активность за 2 дня
            </Button>
          </div>
        )}

        <Input
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm ml-auto"
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Название</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email владельца</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Telegram</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700" title="Max подключён">Max</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700" title="Групп с ботом">Гр.</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700" title="Участников">Уч.</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700" title="Событий">Соб.</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Источник</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Активность</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  {showArchived ? 'Архивирована' : 'Создана'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    {showArchived
                      ? 'Нет архивных организаций'
                      : 'Организации не найдены'}
                  </td>
                </tr>
              ) : (
                filtered.map((org) => (
                  <tr key={org.id} className={`hover:bg-neutral-50 ${showArchived ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-sm font-medium">
                      {org.name}
                      {showArchived && (
                        <span className="ml-2 text-xs text-gray-400">(архив)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {org.owner_email || org.owner_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {org.has_telegram ? (
                        org.telegram_verified ? (
                          org.telegram_username ? (
                            <a
                              href={`https://t.me/${org.telegram_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              ✅ @{org.telegram_username}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              ✅ {org.telegram_display_name || ''}
                              {org.telegram_user_id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSendMessage({
                                      telegramUserId: org.telegram_user_id!,
                                      displayName: org.telegram_display_name || org.name,
                                    })
                                  }}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
                                  title="Написать от имени бота"
                                >
                                  ✉️ бот
                                </button>
                              )}
                            </span>
                          )
                        ) : (
                          <span>⚠️ {org.telegram_display_name || 'Добавлен'}</span>
                        )
                      ) : '❌ Нет'}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">{org.has_max ? '✅' : <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.groups_with_bot}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.participants_count}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.events_count}</td>
                    <td className="px-4 py-3 text-sm">
                      {org.reg_utm_campaign || org.reg_utm_source || org.reg_referrer || org.reg_landing_page || org.reg_partner_code ? (
                        <div
                          className="flex flex-wrap gap-1 items-center cursor-help"
                          title={[
                            org.reg_partner_code && `Партнёр: ${org.reg_partner_code}`,
                            org.reg_utm_campaign && `utm_campaign: ${org.reg_utm_campaign}`,
                            org.reg_utm_source && `utm_source: ${org.reg_utm_source}`,
                            org.reg_referrer && `Referrer: ${org.reg_referrer}`,
                            org.reg_landing_page && `Лендинг: ${org.reg_landing_page}`,
                          ].filter(Boolean).join('\n')}
                        >
                          {org.reg_partner_code && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">🤝 {org.reg_partner_code}</span>
                          )}
                          {org.reg_utm_campaign && !org.reg_partner_code && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">{org.reg_utm_campaign}</span>
                          )}
                          {org.reg_utm_source && !org.reg_utm_campaign && !org.reg_partner_code && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700">{org.reg_utm_source}</span>
                          )}
                          {org.reg_referrer && !org.reg_partner_code && !org.reg_utm_campaign && !org.reg_utm_source && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-sky-100 text-sky-700 truncate max-w-[100px]" title={org.reg_referrer}>
                              {(() => { try { return new URL(org.reg_referrer).hostname } catch { return org.reg_referrer } })()}
                            </span>
                          )}
                          {org.reg_landing_page && !org.reg_partner_code && !org.reg_utm_campaign && !org.reg_utm_source && !org.reg_referrer && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{org.reg_landing_page}</span>
                          )}
                          {org.reg_device_type && (
                            <span className="px-1 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                              {org.reg_device_type === 'mobile' ? '📱' : org.reg_device_type === 'tablet' ? '📱' : '💻'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {org.last_activity ? formatDate(org.last_activity) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {showArchived && org.archived_at
                        ? formatDate(org.archived_at)
                        : formatDate(org.created_at)
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/p/${org.id}/dashboard`}
                          title="Войти в организацию"
                        >
                          <Button variant="ghost" size="sm">
                            <LogIn className="h-4 w-4 text-blue-600" />
                          </Button>
                        </Link>
                        {showArchived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnarchive(org)}
                            disabled={loadingId === org.id}
                            title="Восстановить из архива"
                          >
                            {loadingId === org.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArchiveRestore className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchive(org)}
                            disabled={loadingId === org.id}
                            title="Переместить в архив"
                          >
                            {loadingId === org.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Archive className="h-4 w-4 text-gray-500 hover:text-red-500" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-sm text-gray-500">
        {showArchived
          ? `Архивных: ${filtered.length} из ${archivedOrganizations.length}`
          : `Показано: ${filtered.length} из ${organizations.length}`
        }
      </p>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">
              {confirmDialog.action === 'archive'
                ? '📦 Архивировать организацию?'
                : '📤 Восстановить организацию?'
              }
            </h3>
            <p className="text-gray-600 mb-4">
              {confirmDialog.action === 'archive' ? (
                <>
                  Организация <strong>&quot;{confirmDialog.name}&quot;</strong> будет скрыта из списка
                  пользователей. Все данные (участники, активность, материалы) будут сохранены.
                  <br /><br />
                  <span className="text-amber-600 text-sm">
                    ⚠️ Пользователи, у которых эта организация была единственной, смогут пройти
                    квалификацию заново.
                  </span>
                </>
              ) : (
                <>
                  Организация <strong>&quot;{confirmDialog.name}&quot;</strong> снова станет доступна
                  для пользователей.
                </>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirmDialog(null)}
                disabled={loadingId !== null}
              >
                Отмена
              </Button>
              <Button
                variant="default"
                onClick={confirmAction}
                disabled={loadingId !== null}
                className={confirmDialog.action === 'archive' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                {loadingId !== null ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {confirmDialog.action === 'archive' ? 'Архивировать' : 'Восстановить'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {sendMessage && (
        <SendBotMessageModal
          telegramUserId={sendMessage.telegramUserId}
          displayName={sendMessage.displayName}
          onClose={() => setSendMessage(null)}
        />
      )}
    </div>
  )
}
