'use client'

import { useState, useTransition, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AddAdminDialog } from './add-admin-dialog'

interface TeamMember {
  user_id: string
  role: 'owner' | 'admin'
  role_source: 'manual' | 'telegram_admin' | 'invitation'
  email: string | null
  email_confirmed?: boolean
  full_name: string | null
  telegram_username: string | null
  tg_user_id: number | null
  created_at: string
  has_verified_telegram?: boolean
  is_shadow_profile?: boolean
  last_synced_at?: string
  metadata?: {
    telegram_groups?: number[]
    telegram_group_titles?: string[]
    is_owner_in_groups?: boolean
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

  // Обновляем team когда изменяется initialTeam
  useEffect(() => {
    setTeam(initialTeam)
  }, [initialTeam])

  const fetchTeam = async () => {
    try {
      const teamResponse = await fetch(`/api/organizations/${organizationId}/team`)
      if (teamResponse.ok) {
        const data = await teamResponse.json()
        setTeam(data.team)
      }
    } catch (err) {
      console.error('Error fetching team:', err)
    }
  }

  const handleSync = () => {
    setSyncMessage(null)
    startTransition(async () => {
      try {
        const response = await fetch(`/api/organizations/${organizationId}/team`, {
          method: 'POST'
        })

        if (!response.ok) {
          throw new Error('Не удалось синхронизировать команду')
        }

        // Reload team
        await fetchTeam()
        setSyncMessage('Команда успешно синхронизирована')
      } catch (err: any) {
        setSyncMessage(err.message)
      }
    })
  }

  const owner = team.find(m => m.role === 'owner')
  
  // Фильтруем админов, исключая владельца (если он дублируется)
  const admins = team.filter(m => 
    m.role === 'admin' && 
    m.user_id !== owner?.user_id // Не показываем владельца в списке админов
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Команда организации</CardTitle>
        <div className="flex gap-2">
          {userRole === 'owner' && (
            <AddAdminDialog 
              organizationId={organizationId}
              onAdminAdded={fetchTeam}
            />
          )}
          <Button
            onClick={handleSync}
            disabled={isPending}
            variant="outline"
          >
            {isPending ? 'Синхронизация...' : 'Синхронизировать с Telegram'}
          </Button>
        </div>
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
            <div className="border rounded-lg p-4 bg-purple-50/30">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Имя и роль */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium">
                      {owner.full_name || owner.email || 'Владелец'}
                    </div>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                      👑 Владелец
                    </span>
                  </div>
                  
                  {/* Email и статус */}
                  {owner.email ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-neutral-600">{owner.email}</span>
                      {owner.email_confirmed ? (
                        <span className="text-xs text-green-600">✓ Подтвержден</span>
                      ) : (
                        <span className="text-xs text-amber-600">⏳ Не подтвержден</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-600 mt-1">Email не указан</div>
                  )}
                  
                  {/* Telegram info */}
                  {owner.has_verified_telegram ? (
                    <div className="flex items-center gap-2 mt-2">
                      <svg
                        className="w-4 h-4 text-blue-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
                      </svg>
                      {owner.telegram_username ? (
                        <span className="text-sm text-neutral-600">@{owner.telegram_username}</span>
                      ) : (
                        <span className="text-sm text-neutral-600">ID: {owner.tg_user_id}</span>
                      )}
                      <span className="text-xs text-green-600">✓ Верифицирован</span>
                    </div>
                  ) : owner.tg_user_id ? (
                    <div className="text-sm text-amber-600 mt-2">
                      ⚠️ Telegram не верифицирован
                    </div>
                  ) : (
                    <div className="text-sm text-amber-600 mt-2">
                      ⚠️ Telegram не привязан
                    </div>
                  )}

                  {/* Группы владельца (если есть) */}
                  {owner.admin_groups && owner.admin_groups.length > 0 && (
                    <div className="mt-3 p-2 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="text-xs font-medium text-purple-900 mb-1.5">
                        {owner.metadata?.is_owner_in_groups 
                          ? `👑 Также владелец в группах (${owner.admin_groups.length})`
                          : `Также администратор в группах (${owner.admin_groups.length})`
                        }:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {owner.admin_groups.map((group) => (
                          <span
                            key={group.id}
                            className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-white border border-purple-200 text-purple-700"
                          >
                            {group.title}
                          </span>
                        ))}
                      </div>
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
                      {/* Имя и роль */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium">
                          {admin.full_name || admin.email || admin.telegram_username || 'Администратор'}
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          Администратор
                        </span>
                        {admin.is_shadow_profile && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            👻 Теневой профиль
                          </span>
                        )}
                        {admin.role_source === 'telegram_admin' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                            Из Telegram
                          </span>
                        )}
                      </div>
                      
                      {/* Email и статус */}
                      {admin.email ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-neutral-600">{admin.email}</span>
                          {admin.email_confirmed ? (
                            <span className="text-xs text-green-600">✓ Подтвержден</span>
                          ) : (
                            <span className="text-xs text-amber-600">⏳ Не подтвержден</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-amber-600 mt-1">
                          ⚠️ Email не указан (режим чтения)
                        </div>
                      )}
                      
                      {/* Telegram info */}
                      {admin.has_verified_telegram ? (
                        <div className="flex items-center gap-2 mt-2">
                          <svg
                            className="w-4 h-4 text-blue-500"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
                          </svg>
                          {admin.telegram_username ? (
                            <span className="text-sm text-neutral-600">@{admin.telegram_username}</span>
                          ) : (
                            <span className="text-sm text-neutral-600">ID: {admin.tg_user_id}</span>
                          )}
                          <span className="text-xs text-green-600">✓ Верифицирован</span>
                        </div>
                      ) : admin.tg_user_id ? (
                        <div className="text-sm text-amber-600 mt-2">
                          ⚠️ Telegram не верифицирован
                        </div>
                      ) : null}
                      
                      {/* Группы, где админ */}
                      {admin.role_source === 'telegram_admin' && admin.admin_groups && admin.admin_groups.length > 0 && (
                        <div className="mt-3 p-2 bg-neutral-50 rounded-lg">
                          <div className="text-xs font-medium text-neutral-700 mb-1.5">
                            {admin.metadata?.is_owner_in_groups 
                              ? `👑 Владелец в группах (${admin.admin_groups.length})`
                              : `Администратор в группах (${admin.admin_groups.length})`
                            }:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {admin.admin_groups.map((group) => (
                              <span
                                key={group.id}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-white border border-neutral-200 text-neutral-700"
                              >
                                {group.title}
                              </span>
                            ))}
                          </div>
                          {admin.metadata?.is_owner_in_groups && (
                            <div className="text-xs text-neutral-500 mt-1.5">
                              💡 Создатель (creator) хотя бы в одной из групп
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Дата синхронизации */}
                      {admin.last_synced_at && (
                        <div className="text-xs text-neutral-400 mt-2">
                          Синхронизировано: {new Date(admin.last_synced_at).toLocaleString('ru')}
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
            <li>Администраторы с подтверждённым email могут создавать события и материалы</li>
            <li>Администраторы без email работают в режиме чтения</li>
            <li>При потере статуса админа во всех группах, права автоматически удаляются</li>
            <li>Владелец может вручную добавить администраторов по email</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

