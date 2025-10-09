'use client'

import { useState, useTransition, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface TeamMember {
  user_id: string
  role: 'owner' | 'admin'
  role_source: 'manual' | 'telegram_admin' | 'invitation'
  email: string | null
  full_name: string | null
  telegram_username: string | null
  tg_user_id: number | null
  created_at: string
  metadata: {
    telegram_groups?: number[]
    telegram_group_titles?: string[]
    synced_at?: string
  }
  admin_groups?: Array<{
    id: number
    title: string
  }>
}

interface OrganizationTeamProps {
  organizationId: string
  initialTeam: TeamMember[]
  userRole: 'owner' | 'admin'
}

export default function OrganizationTeam({
  organizationId,
  initialTeam,
  userRole
}: OrganizationTeamProps) {
  const [team, setTeam] = useState<TeamMember[]>(initialTeam)
  const [isPending, startTransition] = useTransition()
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const handleSync = () => {
    setSyncMessage(null)
    startTransition(async () => {
      try {
        const response = await fetch(`/api/organizations/${organizationId}/team/sync`, {
          method: 'POST'
        })

        if (!response.ok) {
          throw new Error('Не удалось синхронизировать команду')
        }

        // Reload team
        const teamResponse = await fetch(`/api/organizations/${organizationId}/team`)
        if (teamResponse.ok) {
          const data = await teamResponse.json()
          setTeam(data.team)
          setSyncMessage('Команда успешно синхронизирована')
        }
      } catch (err: any) {
        setSyncMessage(err.message)
      }
    })
  }

  const owner = team.find(m => m.role === 'owner')
  const admins = team.filter(m => m.role === 'admin')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Команда организации</CardTitle>
        <Button
          onClick={handleSync}
          disabled={isPending}
          variant="outline"
        >
          {isPending ? 'Синхронизация...' : 'Синхронизировать с Telegram'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {syncMessage && (
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg text-sm">
            {syncMessage}
          </div>
        )}

        {/* Owner */}
        {owner && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">Владелец</h3>
            <div className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">
                      {owner.full_name || owner.email || 'Без имени'}
                    </div>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                      Владелец
                    </span>
                  </div>
                  
                  {owner.email && (
                    <div className="text-sm text-neutral-600 mt-1">{owner.email}</div>
                  )}
                  
                  {owner.telegram_username && (
                    <div className="flex items-center gap-2 mt-2">
                      <svg
                        className="w-4 h-4 text-blue-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
                      </svg>
                      <span className="text-sm text-neutral-600">@{owner.telegram_username}</span>
                    </div>
                  )}
                  
                  {!owner.telegram_username && (
                    <div className="text-sm text-amber-600 mt-2">
                      ⚠️ Telegram не привязан
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admins */}
        {admins.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              Администраторы ({admins.length})
            </h3>
            <div className="space-y-3">
              {admins.map((admin) => (
                <div key={admin.user_id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">
                          {admin.full_name || admin.email || 'Без имени'}
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          Администратор
                        </span>
                      </div>
                      
                      {admin.email && (
                        <div className="text-sm text-neutral-600 mt-1">{admin.email}</div>
                      )}
                      
                      {admin.telegram_username && (
                        <div className="flex items-center gap-2 mt-2">
                          <svg
                            className="w-4 h-4 text-blue-500"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
                          </svg>
                          <span className="text-sm text-neutral-600">@{admin.telegram_username}</span>
                        </div>
                      )}
                      
                      {admin.role_source === 'telegram_admin' && admin.admin_groups && admin.admin_groups.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs text-neutral-500 mb-1">
                            Администратор в группах:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {admin.admin_groups.map((group) => (
                              <span
                                key={group.id}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-neutral-100 text-neutral-700"
                              >
                                {group.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {!admin.telegram_username && (
                        <div className="text-sm text-amber-600 mt-2">
                          ⚠️ Telegram не привязан
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {admins.length === 0 && (
          <div className="text-center py-6 text-neutral-500">
            <p>Нет администраторов</p>
            <p className="text-sm mt-1">
              Администраторы автоматически добавляются из Telegram-групп
            </p>
          </div>
        )}

        <div className="pt-4 border-t text-sm text-neutral-500">
          <p className="font-medium mb-2">Как работают права:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Владелец имеет полный доступ ко всем функциям организации</li>
            <li>Администраторы автоматически добавляются из админов Telegram-групп</li>
            <li>Администраторы могут создавать события, материалы и управлять участниками</li>
            <li>При потере статуса админа во всех группах, права автоматически удаляются</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

