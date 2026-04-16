'use client'

import { useState, useTransition, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AddAdminDialog } from './add-admin-dialog'

interface TeamMember {
  user_id: string | null
  role: 'owner' | 'admin'
  role_source: 'manual' | 'telegram_admin' | 'invitation'
  email: string | null
  email_confirmed?: boolean
  full_name: string | null
  telegram_username: string | null
  tg_user_id: number | null
  created_at: string | null
  has_verified_telegram?: boolean
  is_shadow_profile?: boolean
  is_pending_invitation?: boolean
  invitation_id?: string
  invitation_expires_at?: string
  last_synced_at?: string
  metadata?: {
    telegram_groups?: number[]
    telegram_group_titles?: string[]
    is_owner_in_groups?: boolean
    synced_at?: string
    shadow_profile?: boolean
    invited_by?: string
  }
  admin_groups?: Array<{
    id: number
    title: string
  }>
  activation_hint?: string
  /** user_id кандидата, если tg_user_id уже верифицирован в Orbo — можно назначить одним кликом. */
  candidate_user_id?: string | null
}

interface OrganizationTeamProps {
  organizationId: string
  initialTeam: TeamMember[]
  userRole: 'owner' | 'admin'
  allowTelegramAdminRole?: boolean
}

export default function OrganizationTeam({
  organizationId,
  initialTeam,
  userRole,
  allowTelegramAdminRole: initialAllowTelegramAdminRole = true,
}: OrganizationTeamProps) {
  const [team, setTeam] = useState<TeamMember[]>(initialTeam)
  const [isPending, startTransition] = useTransition()
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [allowTelegramAdminRole, setAllowTelegramAdminRole] = useState(initialAllowTelegramAdminRole)
  const [isSavingSetting, setIsSavingSetting] = useState(false)

  // Обновляем team когда изменяется initialTeam
  useEffect(() => {
    setTeam(initialTeam)
  }, [initialTeam])

  const [promotingTgId, setPromotingTgId] = useState<number | null>(null)
  const [promoteError, setPromoteError] = useState<string | null>(null)

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

  const handlePromoteShadowAdmin = async (tgUserId: number, candidateUserId: string | null) => {
    if (!tgUserId) return
    setPromotingTgId(tgUserId)
    setPromoteError(null)
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/team/promote-by-tg`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tg_user_id: tgUserId,
            candidate_user_id: candidateUserId,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setPromoteError(data.error || 'Не удалось назначить администратора')
        return
      }
      setSyncMessage(data.message || 'Администратор назначен')
      await fetchTeam()
    } catch (e: any) {
      setPromoteError(e.message || 'Ошибка сети')
    } finally {
      setPromotingTgId(null)
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
  
  // Фильтруем админов, исключая владельца и pending invitations
  const admins = team.filter(m => 
    m.role === 'admin' && 
    m.user_id !== owner?.user_id && // Не показываем владельца в списке админов
    !m.is_pending_invitation // Показываем отдельно
  )
  
  // Pending invitations
  const pendingInvitations = team.filter(m => m.is_pending_invitation)
  
  // Resend invitation handler
  const [resendingInvitation, setResendingInvitation] = useState<string | null>(null)
  
  const handleResendInvitation = async (email: string) => {
    setResendingInvitation(email)
    try {
      const response = await fetch(`/api/organizations/${organizationId}/team/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resend: true })
      })
      
      if (response.ok) {
        setSyncMessage('Приглашение отправлено повторно')
      } else {
        const data = await response.json()
        setSyncMessage(data.error || 'Не удалось отправить приглашение')
      }
    } catch (err) {
      setSyncMessage('Ошибка при отправке приглашения')
    } finally {
      setResendingInvitation(null)
    }
  }
  
  // Cancel invitation handler
  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('Вы уверены, что хотите отменить приглашение?')) return
    
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitations/${invitationId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        await fetchTeam()
        setSyncMessage('Приглашение отменено')
      } else {
        const data = await response.json()
        setSyncMessage(data.error || 'Не удалось отменить приглашение')
      }
    } catch (err) {
      setSyncMessage('Ошибка при отмене приглашения')
    }
  }

  const handleToggleAdminRole = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked
    setAllowTelegramAdminRole(newValue)
    setIsSavingSetting(true)
    setSyncMessage(null)
    try {
      const res = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_telegram_admin_role: newValue }),
      })
      if (!res.ok) {
        const data = await res.json()
        setSyncMessage(data.error || 'Не удалось сохранить настройку')
        setAllowTelegramAdminRole(!newValue) // revert
        return
      }
      if (!newValue) {
        // Setting turned OFF — immediately sync to strip admin rights
        await fetch(`/api/organizations/${organizationId}/team`, { method: 'POST' })
        await fetchTeam()
        setSyncMessage('Настройка сохранена. Права Telegram-администраторов сняты.')
      } else {
        setSyncMessage('Настройка сохранена. Права будут применены при следующей синхронизации.')
      }
    } catch {
      setSyncMessage('Ошибка при сохранении настройки')
      setAllowTelegramAdminRole(!newValue) // revert
    } finally {
      setIsSavingSetting(false)
    }
  }

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

        {/* ---- Access control setting (owner-only) ---- */}
        {userRole === 'owner' && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={allowTelegramAdminRole}
                onChange={handleToggleAdminRole}
                disabled={isSavingSetting}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-blue-600 disabled:cursor-not-allowed"
              />
              <div>
                <div className="font-medium text-neutral-900">
                  Telegram-администраторы получают права администратора пространства
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  Если включено, администраторы подключённых Telegram-групп автоматически
                  получают роль <strong>Администратора</strong> в этом пространстве и видят
                  его в своём списке организаций. Если отключено — они теряют
                  административный доступ при ближайшей синхронизации и работают как
                  обычные участники.
                </div>
                {!allowTelegramAdminRole && (
                  <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    ⚠️ Права Telegram-администраторов сняты. Ручно добавленные
                    администраторы (по email) продолжают работать в штатном режиме.
                  </div>
                )}
              </div>
            </label>
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
                        <div className="space-y-1 mt-2">
                          <div className="text-sm text-amber-600">
                            ⚠️ Telegram не верифицирован
                          </div>
                          {admin.telegram_username && (
                            <div className="text-sm text-neutral-500">
                              @{admin.telegram_username}
                            </div>
                          )}
                        </div>
                      ) : null}
                      
                      {/* Activation hint for shadow profiles */}
                      {admin.is_shadow_profile && admin.activation_hint && (
                        admin.candidate_user_id && admin.tg_user_id ? (
                          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                            <div className="text-sm text-green-800">
                              ✅ <strong>Готов к назначению:</strong>
                            </div>
                            <div className="text-sm text-green-700">
                              {admin.activation_hint}
                            </div>
                            {userRole === 'owner' && (
                              <Button
                                size="sm"
                                variant="default"
                                className="mt-1"
                                disabled={promotingTgId === admin.tg_user_id}
                                onClick={() =>
                                  handlePromoteShadowAdmin(
                                    admin.tg_user_id as number,
                                    admin.candidate_user_id ?? null
                                  )
                                }
                              >
                                {promotingTgId === admin.tg_user_id
                                  ? 'Назначаем…'
                                  : 'Сделать администратором'}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="text-sm text-blue-800">
                              💡 <strong>Как получить полный доступ:</strong>
                            </div>
                            <div className="text-sm text-blue-700 mt-1">
                              {admin.activation_hint}
                            </div>
                          </div>
                        )
                      )}
                      {promoteError && promotingTgId === null && admin.tg_user_id && admin.is_shadow_profile && (
                        <div className="mt-2 text-xs text-red-600">{promoteError}</div>
                      )}
                      
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

        {admins.length === 0 && pendingInvitations.length === 0 && (
          <div className="text-center py-6 text-neutral-500">
            <p>Нет администраторов</p>
            <p className="text-sm mt-1">
              Администраторы автоматически добавляются из Telegram-групп
            </p>
          </div>
        )}
        
        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              Ожидают приглашения ({pendingInvitations.length})
            </h3>
            <div className="space-y-3">
              {pendingInvitations.map((invite) => (
                <div key={invite.invitation_id || invite.email} className="border border-amber-200 rounded-lg p-4 bg-amber-50/50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium">{invite.email}</div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          ⏳ Ожидает
                        </span>
                      </div>
                      
                      <div className="text-sm text-neutral-600 mt-1">
                        Приглашение отправлено {invite.created_at && new Date(invite.created_at).toLocaleDateString('ru')}
                      </div>
                      
                      {invite.invitation_expires_at && (
                        <div className="text-xs text-neutral-500 mt-1">
                          Действительно до: {new Date(invite.invitation_expires_at).toLocaleDateString('ru')}
                        </div>
                      )}
                      
                      {invite.activation_hint && (
                        <div className="text-sm text-amber-700 mt-2">
                          {invite.activation_hint}
                        </div>
                      )}
                    </div>
                    
                    {/* Actions for owner */}
                    {userRole === 'owner' && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResendInvitation(invite.email!)}
                          disabled={resendingInvitation === invite.email}
                        >
                          {resendingInvitation === invite.email ? '...' : '📧 Повторить'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => invite.invitation_id && handleCancelInvitation(invite.invitation_id)}
                        >
                          ✕
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t text-sm text-neutral-500">
          <p className="font-medium mb-2">Как работают права:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Владелец имеет полный доступ ко всем функциям организации</li>
            <li>
              Администраторы автоматически добавляются из администраторов Telegram-групп
              {' '}— <em>если включена соответствующая настройка выше</em>
            </li>
            <li>Администраторы с подтверждённым email могут создавать события и материалы</li>
            <li>Администраторы без email работают в режиме чтения</li>
            <li>При потере статуса админа во всех группах, права автоматически снимаются</li>
            <li>Владелец может вручную добавить администраторов по email (не зависит от настройки выше)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

