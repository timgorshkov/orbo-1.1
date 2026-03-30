'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users, RefreshCw, CheckCircle2, XCircle, Loader2,
  AlertCircle, UserPlus, Info
} from 'lucide-react'

interface SyncJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_members: number | null
  synced_members: number
  new_members: number
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface Props {
  orgId: string
  tgChatId: number
  groupTitle: string
}

const SERVICE_ACCOUNT_USERNAME = process.env.NEXT_PUBLIC_TG_SERVICE_ACCOUNT_USERNAME || 'orbo_sync_account'
const SERVICE_ACCOUNT_TG_ID = '8548248926'

export default function MemberSyncTab({ orgId, tgChatId, groupTitle }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [job, setJob] = useState<SyncJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isActive = job?.status === 'pending' || job?.status === 'running'

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/telegram/member-sync?orgId=${orgId}&tgChatId=${tgChatId}`
      )
      if (!res.ok) return
      const data = await res.json()
      setConfigured(data.configured)
      setJob(data.job ?? null)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [orgId, tgChatId])

  // Initial load + polling while job is running
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [isActive, fetchStatus])

  const handleStart = async () => {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/telegram/member-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, tgChatId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Ошибка запуска')
        return
      }
      await fetchStatus()
    } catch {
      setError('Ошибка соединения')
    } finally {
      setStarting(false)
    }
  }

  // ── Progress helpers ──────────────────────────────────────────────────────

  const progressPct = job?.total_members && job.synced_members
    ? Math.round((job.synced_members / job.total_members) * 100)
    : null

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('ru') : '—'

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Загрузка...
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Step 1: Instructions ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-600" />
            Шаг 1. Добавьте служебный аккаунт в группу
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-medium mb-2">Зачем это нужно?</p>
            <p className="text-blue-800">
              Бот Orbo видит только тех, кто писал в группу. Чтобы загрузить
              полный список участников (включая тех, кто молчит), в группу нужно
              добавить служебный аккаунт — обычный Telegram-аккаунт, который
              имеет доступ к списку участников через API.
            </p>
          </div>

          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 pl-1">
            <li>
              Откройте Telegram и перейдите в группу{' '}
              <span className="font-medium">«{groupTitle}»</span>
            </li>
            <li>
              Добавьте участника с именем{' '}
              <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                ID: {SERVICE_ACCOUNT_TG_ID}
              </span>
              {' '}или username{' '}
              <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                @{SERVICE_ACCOUNT_USERNAME}
              </span>
            </li>
            <li>
              Права администратора <strong>не нужны</strong> — достаточно обычного участника
            </li>
            <li>
              Вернитесь сюда и нажмите кнопку синхронизации ниже
            </li>
          </ol>

          <div className="flex items-start gap-2 text-xs text-gray-500 mt-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Служебный аккаунт используется только для чтения списка участников.
              Он не пишет в группу и не имеет прав на управление ею.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Step 2: Run sync ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            Шаг 2. Запустить синхронизацию участников
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Not configured */}
          {configured === false && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Служебный аккаунт не подключён к платформе. Обратитесь к
                администратору Orbo для настройки.
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Last job status */}
          {job && (
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Последняя синхронизация</span>
                <StatusBadge status={job.status} />
              </div>

              {/* Progress bar */}
              {(job.status === 'running' || job.status === 'pending') && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>
                      {job.status === 'pending'
                        ? 'Ожидание запуска...'
                        : `Загружено ${job.synced_members}${job.total_members ? ` из ${job.total_members}` : ''}`}
                    </span>
                    {progressPct !== null && <span>{progressPct}%</span>}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${progressPct ?? 5}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Results */}
              {job.status === 'completed' && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white rounded-lg border p-2">
                    <p className="text-lg font-semibold text-gray-900">{job.total_members ?? '—'}</p>
                    <p className="text-xs text-gray-500">Всего в группе</p>
                  </div>
                  <div className="bg-white rounded-lg border p-2">
                    <p className="text-lg font-semibold text-gray-900">{job.synced_members}</p>
                    <p className="text-xs text-gray-500">Обработано</p>
                  </div>
                  <div className="bg-white rounded-lg border p-2">
                    <p className="text-lg font-semibold text-indigo-700">{job.new_members}</p>
                    <p className="text-xs text-gray-500">Добавлено</p>
                  </div>
                </div>
              )}

              {/* Error detail */}
              {job.status === 'failed' && job.error && (
                <p className="text-xs text-red-600 bg-red-50 rounded p-2">{job.error}</p>
              )}

              {/* Timestamps */}
              <div className="text-xs text-gray-400 space-y-0.5">
                <div>Запущено: {formatDate(job.started_at)}</div>
                {job.completed_at && <div>Завершено: {formatDate(job.completed_at)}</div>}
              </div>
            </div>
          )}

          {/* Action button */}
          <Button
            onClick={handleStart}
            disabled={starting || isActive || configured === false}
            className="w-full sm:w-auto"
          >
            {starting || isActive ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isActive ? 'Идёт синхронизация...' : 'Запуск...'}
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {job?.status === 'completed' ? 'Синхронизировать повторно' : 'Запустить синхронизацию'}
              </>
            )}
          </Button>

          <p className="text-xs text-gray-500">
            Для больших групп (1000+ участников) синхронизация займёт несколько минут.
            Прогресс обновляется автоматически — можно закрыть эту страницу.
          </p>
        </CardContent>
      </Card>

    </div>
  )
}

function StatusBadge({ status }: { status: SyncJob['status'] }) {
  const map: Record<SyncJob['status'], { label: string; cls: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Ожидание',
      cls: 'bg-gray-100 text-gray-700',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    running: {
      label: 'Выполняется',
      cls: 'bg-blue-100 text-blue-700',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    completed: {
      label: 'Завершено',
      cls: 'bg-green-100 text-green-700',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    failed: {
      label: 'Ошибка',
      cls: 'bg-red-100 text-red-700',
      icon: <XCircle className="w-3 h-3" />,
    },
  }
  const { label, cls, icon } = map[status]
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {icon}
      {label}
    </span>
  )
}
