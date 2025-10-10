'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Plus, Trash2, Calendar, Users } from 'lucide-react'

interface Invite {
  id: string
  token: string
  access_type: string
  description: string | null
  max_uses: number | null
  current_uses: number
  expires_at: string | null
  is_active: boolean
  created_at: string
}

interface InvitesManagerProps {
  orgId: string
  initialInvites: Invite[]
}

const ACCESS_TYPE_LABELS: Record<string, string> = {
  full: 'Полный доступ',
  events_only: 'Только события',
  materials_only: 'Только материалы',
  limited: 'Ограниченный'
}

export default function InvitesManager({
  orgId,
  initialInvites
}: InvitesManagerProps) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites)
  const [isCreating, setIsCreating] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Форма создания
  const [accessType, setAccessType] = useState<string>('full')
  const [description, setDescription] = useState('')
  const [maxUses, setMaxUses] = useState<number | null>(null)
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null)

  const handleCreate = async () => {
    try {
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null

      const res = await fetch(`/api/organizations/${orgId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_type: accessType,
          description: description || null,
          max_uses: maxUses,
          expires_at: expiresAt
        })
      })

      if (!res.ok) {
        throw new Error('Failed to create invite')
      }

      const newInvite = await res.json()
      setInvites([newInvite, ...invites])
      
      // Сброс формы
      setIsCreating(false)
      setAccessType('full')
      setDescription('')
      setMaxUses(null)
      setExpiresInDays(null)

      alert('Приглашение создано!')
    } catch (error) {
      console.error(error)
      alert('Ошибка при создании приглашения')
    }
  }

  const handleDelete = async (inviteId: string) => {
    if (!confirm('Удалить это приглашение?')) return

    try {
      const res = await fetch(`/api/organizations/${orgId}/invites/${inviteId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        throw new Error('Failed to delete invite')
      }

      setInvites(invites.filter(inv => inv.id !== inviteId))
    } catch (error) {
      console.error(error)
      alert('Ошибка при удалении приглашения')
    }
  }

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/join/${orgId}/${token}`
    navigator.clipboard.writeText(url)
    alert('Ссылка скопирована в буфер обмена!')
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Бессрочно'
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-6">
      {/* Кнопка создания */}
      {!isCreating && (
        <Button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Создать приглашение
        </Button>
      )}

      {/* Форма создания */}
      {isCreating && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Новое приглашение
          </h3>

          {/* Тип доступа */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тип доступа
            </label>
            <select
              value={accessType}
              onChange={(e) => setAccessType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="full">Полный доступ</option>
              <option value="events_only">Только события</option>
              <option value="materials_only">Только материалы</option>
            </select>
          </div>

          {/* Описание */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Описание (необязательно)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Напр.: Приглашение для новых участников"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Лимит использований */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Максимум использований
            </label>
            <input
              type="number"
              value={maxUses || ''}
              onChange={(e) => setMaxUses(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Неограниченно"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              min="1"
            />
          </div>

          {/* Срок действия */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Срок действия (дней)
            </label>
            <input
              type="number"
              value={expiresInDays || ''}
              onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Бессрочно"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              min="1"
            />
          </div>

          {/* Кнопки */}
          <div className="flex gap-2">
            <Button onClick={handleCreate}>
              Создать
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreating(false)
                setAccessType('full')
                setDescription('')
                setMaxUses(null)
                setExpiresInDays(null)
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}

      {/* Список приглашений */}
      <div className="space-y-4">
        {invites.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">Пока нет приглашений</p>
          </div>
        ) : (
          invites.map((invite) => (
            <div
              key={invite.id}
              className="bg-white rounded-lg border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg font-semibold text-gray-900">
                      {ACCESS_TYPE_LABELS[invite.access_type]}
                    </span>
                    {!invite.is_active && (
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                        Неактивно
                      </span>
                    )}
                  </div>
                  {invite.description && (
                    <p className="text-sm text-gray-600 mb-2">{invite.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => handleDelete(invite.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Статистика */}
              <div className="flex items-center gap-6 mb-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>
                    {invite.current_uses}
                    {invite.max_uses ? ` / ${invite.max_uses}` : ''} использований
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(invite.expires_at)}</span>
                </div>
              </div>

              {/* Ссылка */}
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 rounded text-sm text-gray-800 overflow-x-auto">
                  {window.location.origin}/join/{orgId}/{invite.token}
                </code>
                <Button
                  variant="outline"
                  onClick={() => copyInviteLink(invite.token)}
                  className="flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Копировать
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

