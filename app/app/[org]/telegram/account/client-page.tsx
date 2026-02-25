'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClientLogger } from '@/lib/logger'
import { ArrowRight, RefreshCw, Shield, Unlink, ChevronDown, ChevronUp } from 'lucide-react'

type TelegramAccount = {
  id: number;
  telegram_user_id: number;
  telegram_username?: string;
  telegram_first_name?: string;
  telegram_last_name?: string;
  is_verified: boolean;
  verified_at?: string;
  created_at: string;
}

export default function TelegramAccountClient({ params }: { params: { org: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [telegramAccount, setTelegramAccount] = useState<TelegramAccount | null>(null)
  const [error, setError] = useState<string | React.ReactNode | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const [telegramUserId, setTelegramUserId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')

  useEffect(() => {
    fetchTelegramAccount()
  }, [params.org])

  const fetchTelegramAccount = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/telegram/accounts?orgId=${params.org}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch telegram account')
      }

      setTelegramAccount(data.telegramAccount)

      if (data.telegramAccount) {
        setTelegramUserId(data.telegramAccount.telegram_user_id.toString())
      }
    } catch (e: any) {
      const logger = createClientLogger('TelegramAccountClient', { org: params.org });
      logger.error({ error: e.message, org: params.org }, 'Error fetching telegram account');
      setError(e.message || 'Failed to fetch telegram account')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTelegramId = async () => {
    if (!telegramUserId) {
      setError('Пожалуйста, укажите Telegram User ID')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/telegram/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: params.org,
          telegramUserId: parseInt(telegramUserId)
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'BOT_BLOCKED') {
          setError(
            <span>
              Пожалуйста, сначала запустите диалог с{' '}
              <a href="https://t.me/orbo_assistant_bot" target="_blank" rel="noopener noreferrer" className="text-red-700 hover:underline font-medium">
                @orbo_assistant_bot
              </a>
              {' '}в Telegram
            </span>
          )
        } else {
          throw new Error(data.error || 'Failed to save telegram account')
        }
        return
      }

      setSuccess(data.message)
      setTelegramAccount(data.telegramAccount)
      setShowChangeForm(false)
    } catch (e: any) {
      setError(e.message || 'Failed to save telegram account')
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode) {
      setError('Пожалуйста, введите код верификации')
      return
    }

    setVerifying(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/telegram/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: params.org, verificationCode }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify code')
      }

      setSuccess(data.message)
      setTelegramAccount(data.telegramAccount)
      setVerificationCode('')

      if (data.telegramAccount?.is_verified) {
        syncGroups()
      }
    } catch (e: any) {
      setError(e.message || 'Failed to verify code')
    } finally {
      setVerifying(false)
    }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/telegram/accounts?orgId=${params.org}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unlink account')
      }

      setTelegramAccount(null)
      setTelegramUserId('')
      setShowUnlinkConfirm(false)
      setShowChangeForm(false)
      setSuccess('Telegram-аккаунт отвязан. Подключённые группы удалены.')
    } catch (e: any) {
      setError(e.message || 'Failed to unlink account')
    } finally {
      setUnlinking(false)
    }
  }

  const syncGroups = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const adminResponse = await fetch('/api/telegram/groups/update-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: params.org })
      })
      const adminData = await adminResponse.json()
      if (!adminResponse.ok) throw new Error(adminData.error || 'Failed to update admin rights')

      const response = await fetch('/api/telegram/groups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: params.org }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to sync groups')

      setSyncResult(`Обновлено ${adminData.updated} администраторов, синхронизировано ${data.groups?.length || 0} групп`)
    } catch (e: any) {
      setError(e.message || 'Failed to sync groups')
    } finally {
      setSyncing(false)
    }
  }

  const updateAdminRights = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const response = await fetch('/api/telegram/groups/update-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: params.org })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update admin rights')

      setSyncResult(`Обновлены права администраторов: ${data.updated} из ${data.total}`)
    } catch (e: any) {
      setError(e.message || 'Failed to update admin rights')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Настройка Telegram аккаунта</h1>
        <Button variant="outline" size="sm" onClick={() => router.push(`/app/${params.org}/telegram`)}>
          Назад к Telegram
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-6">
          {/* Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* === CONNECTED ACCOUNT === */}
          {telegramAccount && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Текущий Telegram аккаунт</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <span className="text-xs text-gray-400">User ID</span>
                    <div className="font-mono text-sm">{telegramAccount.telegram_user_id}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Username</span>
                    <div className="text-sm">{telegramAccount.telegram_username ? `@${telegramAccount.telegram_username}` : '—'}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Имя</span>
                    <div className="text-sm">
                      {[telegramAccount.telegram_first_name, telegramAccount.telegram_last_name].filter(Boolean).join(' ') || '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Статус</span>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      telegramAccount.is_verified
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {telegramAccount.is_verified ? '✅ Подтверждён' : '⏳ Ожидает подтверждения'}
                    </div>
                  </div>
                </div>

                {telegramAccount.verified_at && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">Подтверждён:</span>{' '}
                    <span className="text-xs text-gray-600">{new Date(telegramAccount.verified_at).toLocaleString('ru')}</span>
                  </div>
                )}

                {/* Action buttons in the card */}
                {telegramAccount.is_verified && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-3">
                    <button
                      onClick={() => { setShowChangeForm(!showChangeForm); setShowUnlinkConfirm(false) }}
                      className="text-xs text-gray-500 hover:text-gray-700 transition flex items-center gap-1"
                    >
                      {showChangeForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Сменить аккаунт
                    </button>
                    <span className="text-gray-200">|</span>
                    <button
                      onClick={() => { setShowUnlinkConfirm(!showUnlinkConfirm); setShowChangeForm(false) }}
                      className="text-xs text-red-400 hover:text-red-600 transition flex items-center gap-1"
                    >
                      <Unlink className="w-3 h-3" />
                      Отвязать аккаунт
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* === UNLINK CONFIRMATION === */}
          {showUnlinkConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-medium text-red-900 mb-2">Отвязать Telegram-аккаунт?</h3>
              <p className="text-sm text-red-800 mb-1">Это действие:</p>
              <ul className="text-sm text-red-800 list-disc pl-5 mb-4 space-y-0.5">
                <li>Удалит привязку вашего Telegram-аккаунта к этой организации</li>
                <li>Удалит все подключённые Telegram-группы и каналы</li>
                <li>Остановит уведомления и аналитику по группам</li>
              </ul>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleUnlink}
                  disabled={unlinking}
                >
                  {unlinking ? 'Отвязка...' : 'Да, отвязать'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnlinkConfirm(false)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}

          {/* === VERIFICATION FORM (unverified account) === */}
          {telegramAccount && !telegramAccount.is_verified && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Подтверждение аккаунта</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-800">
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>
                      Откройте{' '}
                      <a href="https://t.me/orbo_assistant_bot" target="_blank" rel="noopener noreferrer" className="text-amber-900 hover:underline font-medium">
                        @orbo_assistant_bot
                      </a>{' '}
                      в Telegram
                    </li>
                    <li>Нажмите /start если еще не сделали</li>
                    <li>Вы получите код верификации</li>
                    <li>Введите код ниже</li>
                  </ol>
                </div>

                <div>
                  <label className="text-sm text-gray-500 block mb-1.5">Код верификации</label>
                  <Input
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value.toUpperCase())}
                    placeholder="Введите код из Telegram"
                    maxLength={8}
                  />
                </div>

                <Button onClick={handleVerifyCode} disabled={verifying} size="sm">
                  {verifying ? 'Проверка...' : 'Подтвердить код'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* === CHANGE ACCOUNT FORM (shown on toggle or when no account) === */}
          {(showChangeForm || !telegramAccount) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {telegramAccount ? 'Сменить Telegram аккаунт' : 'Добавить Telegram аккаунт'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {telegramAccount && (
                  <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-800">
                    ⚠️ При смене аккаунта потребуется повторная верификация.
                    Подключённые группы сохранятся, но убедитесь, что новый аккаунт
                    является администратором тех же групп.
                  </div>
                )}

                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  <p className="font-medium mb-1.5">Как узнать Telegram User ID:</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>
                      Откройте{' '}
                      <a href="https://t.me/orbo_assistant_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                        @orbo_assistant_bot
                      </a>{' '}
                      и нажмите <code className="bg-blue-100 px-1 rounded">/start</code>
                    </li>
                    <li>Бот отправит вам ваш Telegram User ID</li>
                    <li>Скопируйте ID и вставьте в поле ниже</li>
                  </ol>
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    💡 Сначала запустите бота, иначе код верификации не будет доставлен!
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-500 block mb-1.5">Telegram User ID *</label>
                  <Input
                    type="number"
                    value={telegramUserId}
                    onChange={e => setTelegramUserId(e.target.value)}
                    placeholder="Например: 123456789"
                    required
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    Username, имя и фамилия будут загружены автоматически
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveTelegramId} disabled={saving} size="sm">
                    {saving ? 'Сохранение...' : 'Сохранить и отправить код'}
                  </Button>
                  {telegramAccount && (
                    <Button variant="outline" size="sm" onClick={() => setShowChangeForm(false)}>
                      Отмена
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* === ACTIONS (verified account) === */}
          {telegramAccount?.is_verified && (
            <div className="space-y-3">
              <Button
                onClick={() => router.push(`/app/${params.org}/telegram`)}
                className="gap-2"
              >
                Управление группами
                <ArrowRight className="w-4 h-4" />
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncGroups}
                  disabled={syncing}
                  className="gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Синхронизация...' : 'Синхронизировать группы'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={updateAdminRights}
                  disabled={syncing}
                  className="gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Обновить права
                </Button>
              </div>

              {syncResult && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">
                  {syncResult}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
