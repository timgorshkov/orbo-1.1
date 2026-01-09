'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'

type Organization = {
  id: string
  name: string
  owner_email: string | null
  created_at: string
  status: string
  archived_at?: string | null
  has_telegram: boolean
  telegram_verified: boolean
  telegram_username: string | null
  groups_count: number
  groups_with_bot: number
  participants_count: number
  materials_count: number
  events_count: number
}

interface OrganizationsTableProps {
  organizations: Organization[]
  archivedOrganizations?: Organization[]
}

export default function OrganizationsTable({ 
  organizations, 
  archivedOrganizations = [] 
}: OrganizationsTableProps) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ id: string; name: string; action: 'archive' | 'unarchive' } | null>(null)
  
  const displayOrgs = showArchived ? archivedOrganizations : organizations
  const filtered = displayOrgs.filter(org => 
    org.name.toLowerCase().includes(search.toLowerCase())
  )
  
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
        // Refresh the page to show updated data
        window.location.reload()
      } else {
        const data = await response.json()
        alert(`Ошибка: ${data.error || 'Неизвестная ошибка'}`)
      }
    } catch (error) {
      alert('Ошибка сети')
    } finally {
      setLoadingId(null)
      setConfirmDialog(null)
    }
  }
  
  return (
    <div className="space-y-4">
      {/* Tabs and Search */}
      <div className="flex flex-wrap items-center gap-4">
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
        
        <Input
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
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
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Групп</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">С ботом</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Участников</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Материалов</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">События</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  {showArchived ? 'Архивирована' : 'Создана'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
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
                        <span className="ml-2 text-xs text-gray-400">
                          (архив)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {org.owner_email || '—'}
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
                          ) : '✅ Верифицирован'
                        ) : '⚠️ Добавлен'
                      ) : '❌ Нет'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{org.groups_count}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.groups_with_bot}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.participants_count}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.materials_count}</td>
                    <td className="px-4 py-3 text-sm text-right">{org.events_count}</td>
                    <td className="px-4 py-3 text-sm">
                      {showArchived && org.archived_at
                        ? new Date(org.archived_at).toLocaleDateString('ru-RU')
                        : new Date(org.created_at).toLocaleDateString('ru-RU')
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
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
          : `Активных: ${filtered.length} из ${organizations.length}`
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
