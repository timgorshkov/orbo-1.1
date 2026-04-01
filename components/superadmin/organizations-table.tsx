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
  groups_with_bot: number
  participants_count: number
  events_count: number
  last_activity: string | null
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
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700" title="Групп с ботом">Гр.</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700" title="Участников">Уч.</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700" title="Событий">Соб.</th>
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
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
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
                              ✅ {org.telegram_display_name || 'Верифицирован'}
                              {org.telegram_user_id && (
                                <a
                                  href={`https://t.me/orbo_notification_bot?start=sa_${org.telegram_user_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                  title="Написать через бот"
                                >
                                  ✉️ бот
                                </a>
                              )}
                            </span>
                          )
                        ) : (
                          <span>⚠️ {org.telegram_display_name || 'Добавлен'}</span>
                        )
                      ) : '❌ Нет'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{org.groups_with_bot}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.participants_count}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.events_count}</td>
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
    </div>
  )
}
