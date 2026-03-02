'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, MessageCircle, UserPlus, RefreshCw, Trash2 } from 'lucide-react'

interface GroupInfo {
  id: string
  max_chat_id: number
  title: string | null
  bot_status: string
  member_count: number | null
  last_sync_at: string | null
  link_status: string
}

interface Metrics {
  member_count: number
  active_users_7d: number
  messages_30d: number
  joins_30d: number
}

interface DailyActivity {
  date: string
  message_count: number
}

interface Participant {
  max_user_id: number
  participant_id: string | null
  full_name: string | null
  max_username: string | null
  last_activity: string | null
  messages_30d: number
}

interface Props {
  orgId: string
  group: GroupInfo
  metrics: Metrics
  dailyActivity: DailyActivity[]
  participants: Participant[]
}

export default function MaxGroupClient({ orgId, group, metrics, dailyActivity, participants }: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/max/groups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, max_chat_id: group.max_chat_id }),
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(`Синхронизировано: ${data.synced} новых, ${data.skipped} обновлено`)
        router.refresh()
      } else {
        setSyncResult(`Ошибка: ${data.error || 'Не удалось синхронизировать'}`)
      }
    } catch {
      setSyncResult('Ошибка при синхронизации')
    } finally {
      setSyncing(false)
    }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      const res = await fetch('/api/max/groups/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, chatId: String(group.max_chat_id) }),
      })
      if (res.ok) {
        router.push(`/p/${orgId}/max`)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Не удалось отвязать группу')
        setUnlinking(false)
        setConfirmUnlink(false)
      }
    } catch {
      alert('Ошибка при отвязке группы')
      setUnlinking(false)
      setConfirmUnlink(false)
    }
  }

  // Format date for chart x-axis
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  return (
    <Tabs defaultValue="analytics">
      <TabsList className="mb-6">
        <TabsTrigger value="analytics">Аналитика</TabsTrigger>
        <TabsTrigger value="members">Участники</TabsTrigger>
        <TabsTrigger value="settings">Настройки</TabsTrigger>
      </TabsList>

      {/* ─── Analytics ─────────────────────────────────────────────────────── */}
      <TabsContent value="analytics">
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Участников</p>
                    <p className="text-2xl font-semibold">{metrics.member_count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Активных за 7 дней</p>
                    <p className="text-2xl font-semibold">{metrics.active_users_7d}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <MessageCircle className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Сообщений за 30 дней</p>
                    <p className="text-2xl font-semibold">{metrics.messages_30d}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-50 rounded-lg">
                    <UserPlus className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Вступлений за 30 дней</p>
                    <p className="text-2xl font-semibold">{metrics.joins_30d}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily activity bar chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Активность за последние 14 дней</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyActivity.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Нет данных об активности</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyActivity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number) => [value, 'Сообщений']}
                      labelFormatter={(label) => formatDate(String(label))}
                    />
                    <Bar dataKey="message_count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ─── Members ───────────────────────────────────────────────────────── */}
      <TabsContent value="members">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Участники группы</CardTitle>
            <p className="text-sm text-gray-500">
              Пользователи, проявившие активность в группе
            </p>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                Нет данных об участниках. Синхронизируйте группу во вкладке «Настройки».
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Участник
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Последняя активность
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Сообщений (30д)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {participants.map((p) => {
                      const displayName = p.full_name
                        || (p.max_username ? `@${p.max_username}` : `ID: ${p.max_user_id}`)
                      const handleClick = () => {
                        if (p.participant_id) {
                          router.push(`/p/${orgId}/members/${p.participant_id}`)
                        }
                      }
                      return (
                        <tr
                          key={p.max_user_id}
                          className={p.participant_id ? 'cursor-pointer hover:bg-gray-50' : ''}
                          onClick={p.participant_id ? handleClick : undefined}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-700 flex-shrink-0">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                              <span className="truncate max-w-[180px]">{displayName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {p.max_username ? `@${p.max_username}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {p.last_activity
                              ? new Date(p.last_activity).toLocaleString('ru', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">
                            {p.messages_30d}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ─── Settings ──────────────────────────────────────────────────────── */}
      <TabsContent value="settings">
        <div className="space-y-4">
          {/* Group info */}
          <Card>
            <CardHeader>
              <CardTitle>Информация о группе</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">ID чата в MAX</p>
                <p className="font-mono text-sm bg-gray-50 rounded px-3 py-2 border border-gray-200">
                  {group.max_chat_id}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Название группы</p>
                <p className="font-mono text-sm bg-gray-50 rounded px-3 py-2 border border-gray-200">
                  {group.title || '—'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Синхронизируется автоматически из MAX</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Статус бота</p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      group.bot_status === 'connected' ? 'bg-green-500' : 'bg-amber-400'
                    }`}
                  />
                  <span className="text-sm">
                    {group.bot_status === 'connected' ? 'Подключён' : 'Ожидание'}
                  </span>
                </div>
                {group.last_sync_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Последняя синхронизация:{' '}
                    {new Date(group.last_sync_at).toLocaleString('ru', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sync members */}
          <Card>
            <CardHeader>
              <CardTitle>Синхронизация участников</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-500">
                Загружает текущий список участников из MAX и добавляет новых в базу участников организации.
              </p>
              <Button onClick={handleSync} disabled={syncing} variant="outline" className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Синхронизация...' : 'Синхронизировать участников'}
              </Button>
              {syncResult && (
                <p className={`text-sm ${syncResult.startsWith('Ошибка') ? 'text-red-500' : 'text-green-600'}`}>
                  {syncResult}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Unlink group */}
          <Card className="border-red-100">
            <CardHeader>
              <CardTitle className="text-red-600">Отвязать группу</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-500">
                Отвязывает группу от организации. Данные (история сообщений, участники) сохраняются в базе.
              </p>
              {!confirmUnlink ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => setConfirmUnlink(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Отвязать группу
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    variant="destructive"
                    onClick={handleUnlink}
                    disabled={unlinking}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    {unlinking ? 'Отвязка...' : 'Подтвердить'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmUnlink(false)}
                    disabled={unlinking}
                  >
                    Отмена
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  )
}
