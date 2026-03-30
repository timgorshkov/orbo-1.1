'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ChevronDown, ChevronUp, Unlink, RefreshCw, Plus, Loader2,
  CheckCircle2, XCircle, AlertCircle, Send, Users
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ─── Types ─────────────────────────────────────────────────────────────────

interface MaxAccount {
  id: string
  max_user_id: number
  max_username: string | null
  max_first_name: string | null
  max_last_name: string | null
  is_verified: boolean
  verified_at: string | null
  created_at: string
}

interface MaxGroup {
  id?: string
  max_chat_id: number
  title: string | null
  bot_status: string
  member_count: number | null
  last_sync_at?: string | null
  link_status?: string
  bot_is_admin?: boolean | null
  user_is_admin?: boolean | null
}

interface MaxSettingsClientProps {
  orgId: string
  /** Notifications bot — sends verification codes in DMs */
  botUsername: string | null
  /** Main bot — must be added to groups for them to appear as available */
  mainBotUsername: string | null
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function MaxSettingsClient({ orgId, botUsername, mainBotUsername }: MaxSettingsClientProps) {
  // Account state
  const [account, setAccount] = useState<MaxAccount | null>(null)
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [maxUserId, setMaxUserId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)

  // Groups state
  const [linkedGroups, setLinkedGroups] = useState<MaxGroup[]>([])
  const [availableGroups, setAvailableGroups] = useState<MaxGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)

  // General messages
  const [error, setError] = useState<string | React.ReactNode | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchAccount()
    fetchGroups()
  }, [orgId])

  // ─── Account fetching ───────────────────────────────────────────────────

  const fetchAccount = async () => {
    setLoadingAccount(true)
    try {
      const res = await fetch(`/api/max/accounts?orgId=${orgId}`)
      const data = await res.json()
      if (res.ok) {
        setAccount(data.maxAccount)
        if (data.maxAccount) {
          setMaxUserId(String(data.maxAccount.max_user_id))
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingAccount(false)
    }
  }

  // ─── Groups fetching ────────────────────────────────────────────────────

  const fetchGroups = async () => {
    setLoadingGroups(true)
    try {
      // Linked groups
      const res = await fetch(`/api/max/groups/for-org?orgId=${orgId}`)
      const data = await res.json()
      if (res.ok) {
        setLinkedGroups(data.groups || [])
      }

      // Available (unlinked) groups
      const adminSupaRes = await fetch(`/api/max/groups/available?orgId=${orgId}`)
      if (adminSupaRes.ok) {
        const avData = await adminSupaRes.json()
        setAvailableGroups(avData.groups || [])
      }
    } catch {
      // ignore
    } finally {
      setLoadingGroups(false)
    }
  }

  // ─── Account actions ────────────────────────────────────────────────────

  const handleSaveId = async () => {
    if (!maxUserId.trim()) {
      setError('Укажите MAX User ID')
      return
    }
    const parsedId = parseInt(maxUserId)
    if (isNaN(parsedId) || parsedId < 1000000) {
      setError('MAX User ID должен быть числом от 7 цифр и больше. Узнать его можно, написав боту /start.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/max/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, maxUserId: parseInt(maxUserId) }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'BOT_BLOCKED') {
          setError(
            <span>
              Бот не может написать вам первым — вы ещё не открыли с ним диалог.{' '}
              {botUsername ? (
                <>
                  <a
                    href={`https://max.ru/${botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-700 hover:underline font-medium"
                  >
                    Откройте @{botUsername} в MAX
                  </a>
                  {', отправьте '}
                  <b>/start</b>
                  {' — там же получите свой User ID — и попробуйте снова.'}
                </>
              ) : (
                <>откройте бота в MAX, отправьте <b>/start</b> и попробуйте снова.</>
              )}
            </span>
          )
        } else {
          throw new Error(data.error || 'Ошибка сохранения')
        }
        return
      }
      setSuccess(data.message)
      setAccount(data.maxAccount)
      setShowChangeForm(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setError('Введите код верификации')
      return
    }
    setVerifying(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/max/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, verificationCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка верификации')
      setSuccess(data.message)
      setAccount(data.maxAccount)
      setVerificationCode('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setVerifying(false)
    }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/max/accounts?orgId=${orgId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка отвязки')
      setAccount(null)
      setMaxUserId('')
      setShowUnlinkConfirm(false)
      setShowChangeForm(false)
      setSuccess('MAX-аккаунт отвязан')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUnlinking(false)
    }
  }

  // ─── Group actions ──────────────────────────────────────────────────────

  const handleLinkGroup = async (group: MaxGroup) => {
    setLinking(String(group.max_chat_id))
    setError(null)
    try {
      const res = await fetch('/api/max/groups/add-to-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, max_chat_id: group.max_chat_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка привязки')
      setLinkedGroups(prev => [...prev, { ...group, link_status: 'active' }])
      setAvailableGroups(prev => prev.filter(g => g.max_chat_id !== group.max_chat_id))
      setSuccess(`Группа "${group.title}" привязана`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLinking(null)
    }
  }

  const handleSyncGroup = async (group: MaxGroup) => {
    setSyncing(String(group.max_chat_id))
    setError(null)
    try {
      const res = await fetch('/api/max/groups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, max_chat_id: group.max_chat_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка синхронизации')
      setSuccess(`Синхронизировано: ${data.synced} новых, ${data.skipped} пропущено`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSyncing(null)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Global messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* ── Section 1: Account ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Send className="w-4 h-4 text-indigo-600" />
          Ваш аккаунт MAX
        </h2>

        {loadingAccount ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка...
          </div>
        ) : (
          <>
            {/* Connected account card */}
            {account && (
              <Card className="mb-3">
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    <div>
                      <p className="text-xs text-gray-400">User ID</p>
                      <p className="font-mono text-sm">{account.max_user_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Username</p>
                      <p className="text-sm">{account.max_username ? `@${account.max_username}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Имя</p>
                      <p className="text-sm">
                        {[account.max_first_name, account.max_last_name].filter(Boolean).join(' ') || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Статус</p>
                      {account.is_verified ? (
                        <Badge className="bg-green-100 text-green-800 text-xs">✅ Подтверждён</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 text-xs">⏳ Ожидает подтверждения</Badge>
                      )}
                    </div>
                  </div>
                  {account.verified_at && (
                    <p className="text-xs text-gray-400 mt-3 pt-3 border-t">
                      Подтверждён: {new Date(account.verified_at).toLocaleString('ru')}
                    </p>
                  )}
                  <div className="mt-3 pt-3 border-t flex gap-4">
                    <button
                      onClick={() => { setShowChangeForm(!showChangeForm); setShowUnlinkConfirm(false) }}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      {showChangeForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {account.is_verified ? 'Сменить аккаунт' : 'Изменить номер'}
                    </button>
                    <span className="text-gray-200">|</span>
                    <button
                      onClick={() => { setShowUnlinkConfirm(!showUnlinkConfirm); setShowChangeForm(false) }}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                    >
                      <Unlink className="w-3 h-3" />
                      Отвязать аккаунт
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Unlink confirm */}
            {showUnlinkConfirm && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
                <h3 className="font-medium text-red-900 mb-2">Отвязать MAX-аккаунт?</h3>
                <ul className="text-sm text-red-800 list-disc pl-5 mb-4 space-y-0.5">
                  <li>Удалит привязку вашего MAX-аккаунта к этой организации</li>
                  <li>Вы не сможете управлять MAX-группами</li>
                </ul>
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={handleUnlink} disabled={unlinking} className="bg-red-600 hover:bg-red-700 text-white">
                    {unlinking ? 'Отвязка...' : 'Да, отвязать'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowUnlinkConfirm(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}

            {/* Verification form (pending account) */}
            {account && !account.is_verified && (
              <Card className="mb-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Подтверждение аккаунта</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800">
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>
                        Откройте бота{' '}
                        {botUsername ? (
                          <a href={`https://max.ru/${botUsername}`} target="_blank" rel="noopener noreferrer"
                            className="font-medium text-amber-900 hover:underline">
                            @{botUsername}
                          </a>
                        ) : 'Orbo'}{' '}в MAX и отправьте <b>/start</b>
                      </li>
                      <li>Код верификации придёт в этот диалог автоматически</li>
                      <li>Введите код ниже</li>
                    </ol>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Код верификации</label>
                    <Input
                      value={verificationCode}
                      onChange={e => setVerificationCode(e.target.value.toUpperCase())}
                      placeholder="Например: A1B2C3D4"
                      maxLength={8}
                      className="max-w-xs"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={handleVerifyCode} disabled={verifying}>
                      {verifying ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Проверка...</> : 'Подтвердить код'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleSaveId} disabled={saving}>
                      {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Отправка...</> : 'Запросить код повторно'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add / change account form */}
            {(showChangeForm || !account) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {account ? 'Сменить MAX аккаунт' : 'Добавить MAX аккаунт'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {account && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800">
                      ⚠️ При смене аккаунта потребуется повторная верификация.
                    </div>
                  )}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800">
                    <p className="font-medium mb-1">Инструкция:</p>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>
                        Откройте бота{' '}
                        {botUsername ? (
                          <a href={`https://max.ru/${botUsername}`} target="_blank" rel="noopener noreferrer"
                            className="font-medium text-blue-700 hover:underline">
                            @{botUsername}
                          </a>
                        ) : 'Orbo'}{' '}в MAX и отправьте <b>/start</b>
                      </li>
                      <li>Бот пришлёт ваш MAX User ID — скопируйте и вставьте ниже</li>
                      <li>После нажатия кнопки код верификации придёт в этот же диалог</li>
                    </ol>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">MAX User ID *</label>
                    <Input
                      type="number"
                      value={maxUserId}
                      onChange={e => setMaxUserId(e.target.value)}
                      placeholder="Например: 123456789"
                      className="max-w-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveId} disabled={saving}>
                      {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Отправка кода...</> : 'Сохранить и получить код'}
                    </Button>
                    {account && (
                      <Button variant="outline" size="sm" onClick={() => setShowChangeForm(false)}>
                        Отмена
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Section 2: Groups ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          MAX Группы
        </h2>

        {loadingGroups ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка групп...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Linked groups */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Подключённые группы</CardTitle>
              </CardHeader>
              <CardContent>
                {linkedGroups.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Нет привязанных MAX групп. Добавьте бота{mainBotUsername ? ` @${mainBotUsername}` : ''} в группу MAX, затем привяжите её ниже.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedGroups.map(group => (
                      <div key={group.max_chat_id}
                        className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{group.title || `Chat ${group.max_chat_id}`}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              group.bot_status === 'connected'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {group.bot_status === 'connected' ? 'Подключён' : group.bot_status}
                            </span>
                            {group.member_count != null && (
                              <span className="text-xs text-gray-400">{group.member_count} участников</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline" size="sm"
                          disabled={syncing === String(group.max_chat_id)}
                          onClick={() => handleSyncGroup(group)}
                          className="ml-3 flex-shrink-0"
                        >
                          {syncing === String(group.max_chat_id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><RefreshCw className="w-4 h-4 mr-1" />Синхр.</>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Available groups */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Доступные группы (ещё не привязаны)</CardTitle>
              </CardHeader>
              <CardContent>
                {availableGroups.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Групп для подключения не найдено. Добавьте бота{mainBotUsername ? ` @${mainBotUsername}` : ''} в группу MAX, затем обновите страницу.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableGroups.map(group => (
                      <div key={group.max_chat_id} className="rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-2.5 bg-gray-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{group.title || `Chat ${group.max_chat_id}`}</p>
                            {group.member_count != null && (
                              <p className="text-xs text-gray-400 mt-0.5">{group.member_count} участников</p>
                            )}
                          </div>
                          {group.user_is_admin === false ? (
                            <Button
                              size="sm"
                              disabled
                              variant="outline"
                              className="ml-3 flex-shrink-0 text-gray-400 cursor-not-allowed"
                              title="Вы не являетесь администратором этой группы в MAX"
                            >
                              Нет прав админа
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={linking === String(group.max_chat_id)}
                              onClick={() => handleLinkGroup(group)}
                              className="ml-3 flex-shrink-0"
                            >
                              {linking === String(group.max_chat_id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <><Plus className="w-4 h-4 mr-1" />Привязать</>
                              )}
                            </Button>
                          )}
                        </div>
                        {group.bot_is_admin === false && (
                          <div className="flex items-start gap-1.5 px-2.5 py-1.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>
                              Бот{mainBotUsername ? ` @${mainBotUsername}` : ''} — участник, но не администратор.
                              Назначьте его администратором группы, чтобы Orbo мог получать аналитику.
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card className="border-dashed">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">Как подключить группу MAX</p>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 pl-1">
                  <li>Откройте MAX и перейдите в нужную группу</li>
                  <li>Добавьте бота{mainBotUsername ? ` @${mainBotUsername}` : ''} в группу</li>
                  <li>Назначьте бота администратором группы — это нужно для сбора аналитики</li>
                  <li>Группа появится в списке "Доступные группы" выше</li>
                  <li>Нажмите "Привязать" для подключения к организации</li>
                  <li>Нажмите "Синхр." для импорта участников</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
