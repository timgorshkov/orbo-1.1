'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClientBrowser } from '@/lib/client/supabaseClient'

type TelegramGroupSettings = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  invite_link: string | null;
  bot_status: string | null;
  welcome_message: string | null;
  notification_enabled: boolean;
  last_sync_at: string | null;
  member_count: number | null;
  new_members_count: number | null;
}

type GroupMetrics = {
  message_count: number;
  reply_count: number;
  join_count: number;
  leave_count: number;
  dau_avg: number;
  reply_ratio_avg: number;
  days: number;
}

export default function TelegramGroupPage({ params }: { params: { org: string, groupid: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [group, setGroup] = useState<TelegramGroupSettings | null>(null)
  const [title, setTitle] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  // Аналитика
  const [metrics, setMetrics] = useState<any[]>([])
  const [groupMetrics, setGroupMetrics] = useState<GroupMetrics>({
    message_count: 0,
    reply_count: 0,
    join_count: 0,
    leave_count: 0,
    dau_avg: 0,
    reply_ratio_avg: 0,
    days: 0
  })
  const [topUsers, setTopUsers] = useState<[string, { count: number, username: string | null }][]>([])
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)

  useEffect(() => {
    const fetchGroup = async () => {
      setLoading(true)
      try {
        const supabase = createClientBrowser()
        const { data, error } = await supabase
          .from('telegram_groups')
          .select('*')
          .eq('id', params.groupid)
          .eq('org_id', params.org)
          .single()

        if (error || !data) {
          console.error('Error fetching group:', error)
          setError('Не удалось загрузить данные группы')
          return
        }

        setGroup(data)
        setTitle(data.title || '')
        setWelcomeMessage(data.welcome_message || '')
        setNotificationsEnabled(!!data.notification_enabled)
      } catch (e) {
        console.error('Error:', e)
        setError('Произошла ошибка при загрузке данных')
      } finally {
        setLoading(false)
      }
    }

    fetchGroup()
  }, [params.groupid, params.org])

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!group) return;
      
      setLoadingAnalytics(true)
      try {
        const supabase = createClientBrowser()
        
        // Пробуем использовать функцию с учетом часовой зоны
        const { data: timezonedMetrics, error: tzError } = await supabase.rpc(
          'get_metrics_in_timezone',
          {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id,
            days_ago: 7,
            timezone_name: 'Europe/Moscow'
          }
        )
        
        let metricsData: any[] = [];
        
        if (!tzError && timezonedMetrics) {
          metricsData = timezonedMetrics;
        } else {
          console.log('Using fallback metrics query:', tzError)
          
          // Если функция не существует, используем обычный запрос
          const lastWeek = new Date()
          lastWeek.setDate(lastWeek.getDate() - 7)
          const lastWeekStr = lastWeek.toISOString().split('T')[0]
          
          const { data: fallbackMetrics } = await supabase
            .from('group_metrics')
            .select('*')
            .eq('tg_chat_id', group.tg_chat_id)
            .gte('date', lastWeekStr)
            .order('date')
            
          metricsData = fallbackMetrics || [];
        }
        
        setMetrics(metricsData);
        
        // Агрегируем метрики
        const aggregatedMetrics = {
          message_count: 0,
          reply_count: 0,
          join_count: 0,
          leave_count: 0,
          dau_avg: 0,
          reply_ratio_avg: 0,
          days: 0
        }
        
        if (metricsData && metricsData.length > 0) {
          metricsData.forEach(metric => {
            aggregatedMetrics.message_count += metric.message_count || 0
            aggregatedMetrics.reply_count += metric.reply_count || 0
            aggregatedMetrics.join_count += metric.join_count || 0
            aggregatedMetrics.leave_count += metric.leave_count || 0
            aggregatedMetrics.dau_avg += metric.dau || 0
            aggregatedMetrics.reply_ratio_avg += metric.reply_ratio || 0
            aggregatedMetrics.days++
          })
          
          // Вычисляем средние значения
          const days = aggregatedMetrics.days || 1
          aggregatedMetrics.dau_avg = Math.round(aggregatedMetrics.dau_avg / days)
          aggregatedMetrics.reply_ratio_avg = Math.round(aggregatedMetrics.reply_ratio_avg / days)
        }
        
        setGroupMetrics(aggregatedMetrics);
        
        // Если DAU все равно 0, попробуем получить его напрямую из activity_events
        if (aggregatedMetrics.dau_avg === 0) {
          const sevenDaysAgo = new Date()
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
          
          const { data: activeUsers } = await supabase
            .from('activity_events')
            .select('tg_user_id', { count: 'exact', head: true })
            .eq('tg_chat_id', group.tg_chat_id)
            .eq('event_type', 'message')
            .gte('created_at', sevenDaysAgo.toISOString())
            .limit(1000)
          
          if (activeUsers && activeUsers.length > 0) {
            // Считаем уникальных пользователей
            const uniqueUsers = new Set(activeUsers.map((u: any) => u.tg_user_id))
            setGroupMetrics(prev => ({
              ...prev,
              dau_avg: Math.max(1, Math.round(uniqueUsers.size / 7))
            }))
          }
        }
        
        // Получаем топ-5 активных участников за последние 7 дней
        const lastWeek = new Date()
        lastWeek.setDate(lastWeek.getDate() - 7)
        
        const { data: topParticipants } = await supabase
          .from('activity_events')
          .select('tg_user_id, meta')
          .eq('tg_chat_id', group.tg_chat_id)
          .eq('event_type', 'message')
          .gte('created_at', lastWeek.toISOString())
          .limit(100)
        
        const participantActivity: Record<string, { count: number, username: string | null }> = {}
        
        if (topParticipants) {
          topParticipants.forEach((event: any) => {
            const userId = event.tg_user_id?.toString()
            if (!userId) return
            
            if (!participantActivity[userId]) {
              participantActivity[userId] = { 
                count: 0, 
                username: event.meta?.user?.username || null
              }
            }
            participantActivity[userId].count++
          })
        }
        
        const topUsersList = Object.entries(participantActivity)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
        
        setTopUsers(topUsersList)
        
      } catch (e) {
        console.error('Error fetching analytics:', e)
      } finally {
        setLoadingAnalytics(false)
      }
    }
    
    if (group) {
      fetchAnalytics()
    }
  }, [group, params.org])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClientBrowser()
      const { error } = await supabase
        .from('telegram_groups')
        .update({
          title,
          welcome_message: welcomeMessage || null,
          notification_enabled: notificationsEnabled
        })
        .eq('id', params.groupid)
        .eq('org_id', params.org)

      if (error) {
        throw new Error(error.message)
      }

      setSuccess(true)
    } catch (e: any) {
      console.error('Error saving group settings:', e)
      setError(e.message || 'Произошла ошибка при сохранении настроек')
    } finally {
      setSaving(false)
    }
  }

  const refreshGroupInfo = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/telegram/bot/refresh-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId: params.org,
          groupId: params.groupid
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Ошибка при обновлении информации')
      }

      // Перезагрузить данные группы
      const supabase = createClientBrowser()
      const { data, error } = await supabase
        .from('telegram_groups')
        .select('*')
        .eq('id', params.groupid)
        .eq('org_id', params.org)
        .single()

      if (!error && data) {
        setGroup(data)
        setTitle(data.title || '')
      }

      setSuccess(true)
    } catch (e: any) {
      console.error('Error refreshing group:', e)
      setError(e.message || 'Произошла ошибка при обновлении')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram`} telegramGroups={[]}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {group?.title || 'Telegram группа'}
        </h1>
        <Button variant="outline" onClick={() => router.push(`/app/${params.org}/telegram`)}>
          Назад
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">Загрузка...</div>
      ) : (
        <Tabs defaultValue="analytics">
          <TabsList className="mb-6">
            <TabsTrigger value="analytics">Аналитика</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
          </TabsList>
          
          <TabsContent value="analytics">
            {loadingAnalytics ? (
              <div className="text-center py-8">Загрузка аналитики...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Общая статистика</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-neutral-500">Участников</div>
                          <div className="text-xl font-semibold">{group?.member_count || 0}</div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500">Сообщений за 7 дней</div>
                          <div className="text-xl font-semibold">{groupMetrics.message_count}</div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500">Активных пользователей (DAU)</div>
                          <div className="text-xl font-semibold">{groupMetrics.dau_avg}</div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500">Коэффициент ответов</div>
                          <div className="text-xl font-semibold">{groupMetrics.reply_ratio_avg}%</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Динамика участников</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-neutral-500">Новых участников</div>
                          <div className="text-xl font-semibold">{group?.new_members_count || groupMetrics.join_count || 0}</div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500">Ушло участников</div>
                          <div className="text-xl font-semibold">{groupMetrics.leave_count}</div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500">Чистый прирост</div>
                          <div className="text-xl font-semibold">
                            {(group?.new_members_count || groupMetrics.join_count || 0) - groupMetrics.leave_count}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500">Активность</div>
                          <div className="text-xl font-semibold">
                            {group?.member_count && group.member_count > 0 
                              ? Math.round((groupMetrics.dau_avg / group.member_count) * 100) 
                              : 0}%
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Топ активных участников</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {topUsers.length > 0 ? (
                        <div className="space-y-2">
                          {topUsers.map(([userId, data], index) => (
                            <div key={userId} className="flex justify-between items-center">
                              <div className="flex items-center">
                                <span className="w-5 h-5 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs mr-2">
                                  {index + 1}
                                </span>
                                <span>
                                  {data.username ? `@${data.username}` : `ID: ${userId}`}
                                </span>
                              </div>
                              <span className="text-sm text-neutral-500">{data.count} сообщ.</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-neutral-500">
                          Нет данных об активности
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle>Дневная активность</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {metrics && metrics.length > 0 ? (
                        <div className="space-y-2">
                          {metrics.map((metric: any) => (
                            <div key={metric.date} className="flex justify-between items-center">
                              <span>{new Date(metric.date).toLocaleDateString('ru')}</span>
                              <div className="flex items-center space-x-4">
                                <span className="text-sm text-neutral-500">{metric.message_count || 0} сообщ.</span>
                                <span className="text-sm text-neutral-500">{metric.dau || 0} активн.</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-neutral-500">
                          Нет данных о дневной активности
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="settings">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Основная информация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    ID группы в Telegram
                  </label>
                  <Input value={group?.tg_chat_id || ''} disabled className="bg-gray-50" />
                  <p className="text-xs text-neutral-500 mt-1">
                    Технический идентификатор группы в системе Telegram
                  </p>
                </div>

                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    Название группы
                  </label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Название группы"
                  />
                </div>

                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    Статус бота
                  </label>
                  <div className="flex items-center">
                    <span
                      className={`inline-block w-3 h-3 rounded-full mr-2 ${
                        group?.bot_status === 'connected' ? 'bg-green-500' : 'bg-amber-500'
                      }`}
                    />
                    <span>
                      {group?.bot_status === 'connected' ? 'Подключен' : 'Ожидание прав администратора'}
                    </span>
                  </div>
                  {group?.last_sync_at && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Последняя синхронизация: {new Date(group.last_sync_at).toLocaleString('ru')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    Ссылка для приглашения
                  </label>
                  <Input value={group?.invite_link || ''} readOnly className="bg-gray-50" />
                  {!group?.invite_link && group?.bot_status !== 'connected' && (
                    <p className="text-xs text-amber-500 mt-1">
                      Для создания ссылки-приглашения бот должен быть администратором
                    </p>
                  )}
                </div>

                <Button onClick={refreshGroupInfo} disabled={loading}>
                  Обновить информацию о группе
                </Button>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Настройки уведомлений</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="notifications"
                    checked={notificationsEnabled}
                    onChange={e => setNotificationsEnabled(e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="notifications">Включить уведомления о событиях</label>
                </div>
                <p className="text-xs text-neutral-500">
                  При включении этой опции, бот будет отправлять уведомления о новых событиях в группу
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Приветственное сообщение</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    Сообщение для новых участников
                  </label>
                  <textarea
                    className="w-full p-2 border rounded-lg min-h-[100px]"
                    value={welcomeMessage}
                    onChange={e => setWelcomeMessage(e.target.value)}
                    placeholder="Добро пожаловать в нашу группу! Здесь вы можете..."
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Поддерживается HTML-форматирование: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;
                  </p>
                </div>

                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}

                {success && (
                  <div className="text-green-500 text-sm">
                    Настройки успешно сохранены
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Сохранение...' : 'Сохранить настройки'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  )
}
