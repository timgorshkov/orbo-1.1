'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/logger'
import { ymGoal } from '@/components/analytics/YandexMetrika'
import {
  ArrowRight, RefreshCw, Shield, Unlink,
  ChevronDown, ChevronUp, Copy, Check, ExternalLink, CheckCircle2,
} from 'lucide-react'

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

const POLL_INTERVAL_MS = 2500
const MAX_POLL_ATTEMPTS = 72 // 3 min

export default function TelegramAccountClient({ params }: { params: { org: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [telegramAccount, setTelegramAccount] = useState<TelegramAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  // Code-based connect flow
  const [justConnected, setJustConnected] = useState(false)
  const [connectCode, setConnectCode] = useState<string | null>(null)
  const [connectBotUsername, setConnectBotUsername] = useState(
    process.env.NEXT_PUBLIC_TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot'
  )
  const [connectStatus, setConnectStatus] = useState<'idle' | 'waiting' | 'connected' | 'error'>('idle')
  const [codeCopied, setCodeCopied] = useState(false)
  const [botCopied, setBotCopied] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollCount = useRef(0)

  useEffect(() => {
    fetchTelegramAccount()
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current) }
  }, [params.org])

  const fetchTelegramAccount = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/telegram/accounts?orgId=${params.org}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch telegram account')
      setTelegramAccount(data.telegramAccount)
    } catch (e: any) {
      const logger = createClientLogger('TelegramAccountClient', { org: params.org })
      logger.error({ error: e.message }, 'Error fetching telegram account')
      setError(e.message || 'Failed to fetch telegram account')
    } finally {
      setLoading(false)
    }
  }

  // Generate a code when no account is connected (or when change form is open)
  useEffect(() => {
    const shouldGenerate = !loading && (!telegramAccount || showChangeForm)
    if (!shouldGenerate || connectCode) return

    fetch('/api/auth/telegram-code/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: params.org }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.code) {
          setConnectCode(data.code)
          if (data.botUsername) setConnectBotUsername(data.botUsername)
        } else {
          setConnectStatus('error')
        }
      })
      .catch(() => setConnectStatus('error'))
  }, [loading, telegramAccount, showChangeForm])

  // Start polling as soon as code is ready
  useEffect(() => {
    if (connectCode && connectStatus === 'idle') {
      startConnectPolling(connectCode)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectCode])

  const startConnectPolling = (codeValue: string) => {
    setConnectStatus('waiting')
    pollCount.current = 0

    const tick = async () => {
      pollCount.current++
      if (pollCount.current > MAX_POLL_ATTEMPTS) return

      try {
        const res = await fetch(`/api/auth/telegram-code/status?code=${codeValue}`)
        if (res.ok) {
          const data = await res.json()
          if (data.linked) {
            setConnectStatus('connected')
            ymGoal('telegram_account_connected')
            setShowChangeForm(false)
            setConnectCode(null)
            setConnectStatus('idle')
            setJustConnected(true)
            // Reload account data
            await fetchTelegramAccount()
            // Sync groups non-blocking
            syncGroups()
            return
          }
        }
      } catch { /* retry */ }

      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS)
    }

    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS)
  }

  const handleCopyCode = () => {
    if (!connectCode) return
    navigator.clipboard.writeText(connectCode).catch(() => {})
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const handleOpenChangeForm = () => {
    setShowChangeForm(true)
    setShowUnlinkConfirm(false)
    // Reset connect flow so a new code gets generated
    if (pollTimer.current) clearTimeout(pollTimer.current)
    setConnectCode(null)
    setConnectStatus('idle')
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/telegram/accounts?orgId=${params.org}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to unlink account')
      setTelegramAccount(null)
      setShowUnlinkConfirm(false)
      setShowChangeForm(false)
      setConnectCode(null)
      setConnectStatus('idle')
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
        body: JSON.stringify({ orgId: params.org }),
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
        body: JSON.stringify({ orgId: params.org }),
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

  // Code-based connect UI (used when no account, or change form is open)
  const renderConnectForm = (title: string) => {
    const deepLink = connectCode
      ? `https://t.me/${connectBotUsername}?start=${connectCode}`
      : `https://t.me/${connectBotUsername}`

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {telegramAccount && (
            <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-800">
              ⚠️ При смене аккаунта подключённые группы сохранятся, но убедитесь,
              что новый аккаунт является администратором тех же групп.
            </div>
          )}

          {connectStatus === 'connected' ? (
            <div className="flex items-center gap-2 text-green-600 font-medium py-2">
              <CheckCircle2 className="w-5 h-5" />
              Telegram подключён!
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-700">
                <span>Откройте</span>
                <span className="font-semibold">@{connectBotUsername}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(`@${connectBotUsername}`).catch(() => {}); setBotCopied(true); setTimeout(() => setBotCopied(false), 2000); }}
                  className="inline-flex items-center p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Скопировать имя бота"
                >
                  {botCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <span>в Telegram и отправьте этот код:</span>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                {connectCode ? (
                  <div className="flex items-center gap-3">
                    <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-blue-700 select-all text-center">
                      {connectCode}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 hover:border-blue-400 text-blue-600 text-sm font-medium transition-colors"
                    >
                      {codeCopied ? (
                        <><Check className="w-4 h-4 text-green-500" /><span className="hidden sm:inline text-green-600">Скопировано</span></>
                      ) : (
                        <><Copy className="w-4 h-4" /><span className="hidden sm:inline">Копировать</span></>
                      )}
                    </button>
                  </div>
                ) : connectStatus === 'error' ? (
                  <p className="text-sm text-red-500 text-center py-1">
                    Не удалось сгенерировать код.{' '}
                    <button onClick={() => { setConnectCode(null); setConnectStatus('idle') }} className="underline">
                      Попробовать снова
                    </button>
                  </p>
                ) : (
                  <div className="text-center text-sm text-blue-400 py-1">Генерация кода...</div>
                )}
              </div>

              {connectStatus === 'waiting' && (
                <p className="text-xs text-gray-500 text-center">
                  Ожидаем подтверждение от бота...
                </p>
              )}

              {connectCode && (
                <div className="text-center">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Открыть бота в один клик
                  </a>
                  <p className="text-xs text-gray-400 mt-0.5">Может не работать при блокировках</p>
                </div>
              )}
            </>
          )}

          {telegramAccount && (
            <Button variant="outline" size="sm" onClick={() => { setShowChangeForm(false); setConnectCode(null); setConnectStatus('idle') }}>
              Отмена
            </Button>
          )}
        </CardContent>
      </Card>
    )
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

          {/* Connected account info */}
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
                      telegramAccount.is_verified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
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

                {telegramAccount.is_verified && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-3">
                    <button
                      onClick={() => showChangeForm ? (setShowChangeForm(false), setConnectCode(null), setConnectStatus('idle')) : handleOpenChangeForm()}
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

          {/* Unlink confirmation */}
          {showUnlinkConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-medium text-red-900 mb-2">Отвязать Telegram-аккаунт?</h3>
              <ul className="text-sm text-red-800 list-disc pl-5 mb-4 space-y-0.5">
                <li>Удалит привязку вашего Telegram-аккаунта к этой организации</li>
                <li>Удалит все подключённые Telegram-группы и каналы</li>
                <li>Остановит уведомления и аналитику по группам</li>
              </ul>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={handleUnlink} disabled={unlinking}>
                  {unlinking ? 'Отвязка...' : 'Да, отвязать'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowUnlinkConfirm(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          )}

          {/* Connect form: no account yet OR change form opened */}
          {(!telegramAccount || showChangeForm) && renderConnectForm(
            telegramAccount ? 'Сменить Telegram аккаунт' : 'Добавить Telegram аккаунт'
          )}

          {/* Actions for verified account */}
          {telegramAccount?.is_verified && !showChangeForm && (
            <div className="space-y-3">
              <Button
                size="sm"
                variant={justConnected ? 'default' : 'outline'}
                onClick={() => router.push(`/p/${params.org}/telegram`)}
                className="gap-1.5"
              >
                {justConnected ? 'Перейти к подключению групп' : 'Настройки Telegram'}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={syncGroups} disabled={syncing} className="gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Синхронизация...' : 'Синхронизировать группы'}
                </Button>
                <Button variant="outline" size="sm" onClick={updateAdminRights} disabled={syncing} className="gap-1.5">
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
