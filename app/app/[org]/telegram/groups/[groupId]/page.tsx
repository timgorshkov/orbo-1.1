'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClientBrowser } from '@/lib/client/supabaseClient'
import { RemoveGroupButton } from '@/components/telegram-group-actions'

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
  status: string; // Added status field
}

type GroupMetrics = {
  message_count: number;
  reply_count: number;
  join_count: number;
  leave_count: number;
  dau_avg: number;
  reply_ratio_avg: number;
  days: number;
  silent_rate: number;
  newcomer_activation: number;
  activity_gini: number;
  prime_time: Array<{
    hour: number;
    message_count: number;
    is_prime_time: boolean;
  }>;
  risk_radar: Array<{
    tg_user_id: number;
    username: string;
    risk_score: number;
    last_activity: string;
    message_count: number;
  }>;
}

export default function TelegramGroupPage({ params }: { params: { org: string, groupid?: string, groupId?: string } }) {
  // Исправляем проблему с несоответствием имен параметров (groupid vs groupId)
  const groupIdParam = params.groupid || params.groupId;
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [group, setGroup] = useState<TelegramGroupSettings | null>(null)
  const [title, setTitle] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
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
          days: 0,
          silent_rate: 0,
          newcomer_activation: 0,
          activity_gini: 0,
          prime_time: Array.from({ length: 24 }, (_, i) => ({ hour: i, message_count: 0, is_prime_time: false })),
          risk_radar: []
  })
  const [topUsers, setTopUsers] = useState<[string, { count: number, username: string | null }][]>([])
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)

  useEffect(() => {
    const fetchGroup = async () => {
      setLoading(true)
      try {
        console.log('Fetching group with ID:', groupIdParam, 'for org:', params.org);

        if (!groupIdParam) {
          setError('Не указан ID группы. Пожалуйста, вернитесь на страницу списка групп и выберите группу.');
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/telegram/groups/detail?orgId=${encodeURIComponent(params.org)}&groupId=${encodeURIComponent(groupIdParam)}`);
        const data = await res.json();

        if (!res.ok || !data.group) {
          const message = data?.error || res.statusText || 'Не удалось загрузить данные группы';
          setError(`Не удалось загрузить данные группы: ${message}`);
          return;
        }

        const groupData = data.group;
        console.log('Fetched group data (with mapping support):', groupData);

        setGroup(groupData);
        setTitle(groupData.title || '');
        setWelcomeMessage(groupData.welcome_message || '');
        setNotificationsEnabled(!!groupData.notification_enabled);
        if (groupData.status === 'archived') {
          setAnalyticsError('Группа находилась в архивации. После восстановления необходимо вернуть права администратора боту.');
        } else {
          setAnalyticsError(null);
        }
        setError(null);
      } catch (e: any) {
        console.error('Error:', e);
        setError('Произошла ошибка при загрузке данных: ' + (e.message || e));
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [groupIdParam, params.org]);

  // Выносим функцию fetchAnalytics за пределы useEffect, чтобы её можно было вызвать из кнопки
  const fetchAnalytics = async () => {
      if (!group) {
        console.log('No group data available for analytics');
        return;
      }
      
      setLoadingAnalytics(true)
      setAnalyticsError(null)
      try {
        console.log('Fetching analytics for group:', group)
        
        // Используем более надежный подход с обработкой ошибок для каждого запроса
        // Создаем API запрос для получения данных через сервисную роль на сервере
        const apiUrl = `/api/telegram/analytics/data?orgId=${params.org}&groupId=${group.id}&chatId=${group.tg_chat_id}`;
        console.log('Fetching analytics from API:', apiUrl);
        
        try {
          const analyticsResponse = await fetch(apiUrl);
          const analyticsData = await analyticsResponse.json();
          
          console.log('Analytics API response:', analyticsData);
          
          if (analyticsData.error) {
            console.error('Analytics API error:', analyticsData.error);
            setAnalyticsError('Ошибка при загрузке аналитики: ' + analyticsData.error);
            setLoadingAnalytics(false);
            return;
          }
          
          // Обновляем метрики из API
          if (analyticsData.metrics) {
            setGroupMetrics({
              message_count: analyticsData.metrics.message_count || 0,
              reply_count: analyticsData.metrics.reply_count || 0,
              join_count: analyticsData.metrics.join_count || 0,
              leave_count: analyticsData.metrics.leave_count || 0,
              dau_avg: analyticsData.metrics.dau_avg || 0,
              reply_ratio_avg: analyticsData.metrics.reply_ratio_avg || 0,
              days: analyticsData.metrics.days || 0,
              silent_rate: analyticsData.metrics.silent_rate || 0,
              newcomer_activation: analyticsData.metrics.newcomer_activation || 0,
              activity_gini: analyticsData.metrics.activity_gini || 0,
              prime_time: analyticsData.metrics.prime_time || Array.from({ length: 24 }, (_, i) => ({ hour: i, message_count: 0, is_prime_time: false })),
              risk_radar: analyticsData.metrics.risk_radar || []
            });
          }
          
          // Обновляем топ пользователей из API
          if (analyticsData.topUsers) {
            setTopUsers(analyticsData.topUsers);
          }
          
          // Обновляем дневные метрики из API
          if (analyticsData.dailyMetrics) {
            setMetrics(analyticsData.dailyMetrics);
          }
          
          setLoadingAnalytics(false);
          return;
        } catch (apiError: any) {
          console.error('Error fetching from analytics API:', apiError);
          // Продолжаем с клиентским запросом как запасной вариант
        }
        
        // Запасной вариант - используем клиентский запрос
        const supabase = createClientBrowser();
        
        console.log('Group data for analytics:', {
          group_id: group.id,
          tg_chat_id: group.tg_chat_id,
          org_id: params.org,
          title: group.title
        });
        
        // Проверим напрямую наличие данных в activity_events
        const { data: activityCheck, error: activityError } = await supabase
          .from('activity_events')
          .select('id, event_type, created_at, tg_user_id')
          .eq('tg_chat_id', group.tg_chat_id)
          .order('created_at', { ascending: false })
          .limit(10);
          
        console.log('Recent activity events check:', { 
          count: activityCheck?.length || 0, 
          events: activityCheck,
          error: activityError 
        });
        
        // Сначала получаем базовые метрики
        const { data: timezonedMetrics, error: tzError } = await supabase.rpc(
          'get_metrics_in_timezone',
          {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id,
            days_ago: 7,
            timezone_name: 'Europe/Moscow'
          }
        )
        
        console.log('Basic metrics result:', { timezonedMetrics, tzError })
        
        // Пробуем получить расширенные метрики, но не блокируем основной поток
        let silentRate = 0
        let newcomerActivation = 0
        let primeTime = []
        let activityGini = 0
        let riskRadar = []
        
        try {
          const { data: silentRateData, error: silentRateError } = await supabase.rpc('get_silent_rate', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (silentRateError) {
            console.error('Error fetching silent_rate:', silentRateError)
          }
          
          const silentRateResult = { data: silentRateData || 0 }
          silentRate = silentRateResult.data
          console.log('Silent rate:', silentRate)
        } catch (e) {
          console.error('Silent rate error:', e)
        }
        
        try {
          const { data: newcomerData, error: newcomerError } = await supabase.rpc('get_newcomer_activation', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (newcomerError) {
            console.error('Error fetching newcomer_activation:', newcomerError)
          }
          
          const newcomerResult = { data: newcomerData || 0 }
          newcomerActivation = newcomerResult.data
          console.log('Newcomer activation:', newcomerActivation)
        } catch (e) {
          console.error('Newcomer activation error:', e)
        }
        
        try {
          const { data: primeTimeData, error: primeTimeError } = await supabase.rpc('get_prime_time', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (primeTimeError) {
            console.error('Error fetching prime_time:', primeTimeError)
          }
          
          const primeTimeResult = { data: primeTimeData || [] }
          primeTime = primeTimeResult.data || []
          console.log('Prime time:', primeTime)
        } catch (e) {
          console.error('Prime time error:', e)
        }
        
        try {
          const { data: giniData, error: giniError } = await supabase.rpc('get_activity_gini', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (giniError) {
            console.error('Error fetching activity_gini:', giniError)
          }
          
          const giniResult = { data: giniData || 0 }
          activityGini = giniResult.data
          console.log('Activity gini:', activityGini)
        } catch (e) {
          console.error('Activity gini error:', e)
        }
        
        try {
          const { data: riskData, error: riskError } = await supabase.rpc('get_risk_radar', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (riskError) {
            console.error('Error fetching risk_radar:', riskError)
          }
          
          const riskResult = { data: riskData || [] }
          riskRadar = riskResult.data || []
          console.log('Risk radar:', riskRadar)
        } catch (e) {
          console.error('Risk radar error:', e)
        }
        
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
        
        // Добавляем новые метрики
        const updatedMetrics = {
          ...aggregatedMetrics,
          silent_rate: silentRate || 0,
          newcomer_activation: newcomerActivation || 0,
          activity_gini: activityGini || 0,
          prime_time: primeTime && primeTime.length > 0 
            ? primeTime 
            : Array.from({ length: 24 }, (_, i) => ({ hour: i, message_count: 0, is_prime_time: false })),
          risk_radar: riskRadar || []
        };
        
        console.log('Final metrics to display:', updatedMetrics);
        setGroupMetrics(updatedMetrics);
        
        // Если DAU все равно 0, попробуем получить его напрямую из activity_events
        if (aggregatedMetrics.dau_avg === 0) {
          const sevenDaysAgo = new Date()
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
          
          console.log('DAU is 0, trying direct calculation from activity_events');
          
          // Используем более точный запрос для подсчета уникальных пользователей по дням
          const { data: dailyActiveUsers, error: dauError } = await supabase
            .from('activity_events')
            .select('tg_user_id, created_at')
            .eq('tg_chat_id', group.tg_chat_id)
            .eq('event_type', 'message')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1000)
            
          console.log('Direct DAU query result:', { 
            count: dailyActiveUsers?.length || 0,
            error: dauError
          });
          
          if (dailyActiveUsers && dailyActiveUsers.length > 0) {
            // Группируем по дням и считаем уникальных пользователей
            const usersByDay: Record<string, Set<string>> = {};
            
            dailyActiveUsers.forEach((event: any) => {
              const day = new Date(event.created_at).toISOString().split('T')[0];
              if (!usersByDay[day]) {
                usersByDay[day] = new Set();
              }
              if (event.tg_user_id) {
                usersByDay[day].add(event.tg_user_id.toString());
              }
            });
            
            // Считаем среднее DAU
            const days = Object.keys(usersByDay).length || 1;
            let totalActiveUsers = 0;
            
            Object.values(usersByDay).forEach(users => {
              totalActiveUsers += users.size;
            });
            
            const avgDau = Math.max(1, Math.round(totalActiveUsers / days));
            console.log('Calculated DAU:', { 
              days, 
              totalActiveUsers, 
              avgDau,
              usersByDay: Object.fromEntries(
                Object.entries(usersByDay).map(([day, users]) => [day, users.size])
              )
            });
            
            setGroupMetrics(prev => ({
              ...prev,
              dau_avg: avgDau
            }));
            
            // Также обновляем количество сообщений, если оно 0
            if (aggregatedMetrics.message_count === 0) {
              setGroupMetrics(prev => ({
                ...prev,
                message_count: dailyActiveUsers.length
              }));
            }
          }
        }
        
        // Получаем топ-5 активных участников за последние 7 дней
        const lastWeek = new Date()
        lastWeek.setDate(lastWeek.getDate() - 7)
        
        console.log('Fetching top participants');
        
        const { data: topParticipants, error: topError } = await supabase
          .from('activity_events')
          .select('tg_user_id, meta, created_at')
          .eq('tg_chat_id', group.tg_chat_id)
          .eq('event_type', 'message')
          .gte('created_at', lastWeek.toISOString())
          .order('created_at', { ascending: false })
          .limit(500)
        
        console.log('Top participants query result:', {
          count: topParticipants?.length || 0,
          error: topError,
          sample: topParticipants?.slice(0, 3) || []
        });
        
        const participantActivity: Record<string, { count: number, username: string | null }> = {}
        
        if (topParticipants && topParticipants.length > 0) {
          topParticipants.forEach((event: any) => {
            const userId = event.tg_user_id?.toString()
            if (!userId) return
            
            if (!participantActivity[userId]) {
              // Проверяем разные варианты хранения имени пользователя в meta
              let username = null;
              if (event.meta?.user?.username) {
                username = event.meta.user.username;
              } else if (event.meta?.from?.username) {
                username = event.meta.from.username;
              } else if (event.meta?.username) {
                username = event.meta.username;
              } else if (event.meta?.first_name) {
                username = event.meta.first_name + (event.meta.last_name ? ' ' + event.meta.last_name : '');
              }
              
              participantActivity[userId] = { 
                count: 0, 
                username: username
              }
            }
            participantActivity[userId].count++
          })
          
          console.log('Participant activity calculated:', {
            uniqueUsers: Object.keys(participantActivity).length,
            sample: Object.entries(participantActivity).slice(0, 3)
          });
        } else {
          // Если не нашли данные через event_type='message', попробуем искать все события
          console.log('No message events found, trying all events');
          
          const { data: allEvents, error: allEventsError } = await supabase
            .from('activity_events')
            .select('tg_user_id, meta, created_at, event_type')
            .eq('tg_chat_id', group.tg_chat_id)
            .gte('created_at', lastWeek.toISOString())
            .order('created_at', { ascending: false })
            .limit(500)
            
          console.log('All events query result:', {
            count: allEvents?.length || 0,
            error: allEventsError,
            eventTypes: allEvents ? Array.from(new Set(allEvents.map((e: any) => e.event_type))) : []
          });
          
          if (allEvents && allEvents.length > 0) {
            allEvents.forEach((event: any) => {
              const userId = event.tg_user_id?.toString()
              if (!userId) return
              
              if (!participantActivity[userId]) {
                let username = null;
                if (event.meta?.user?.username) {
                  username = event.meta.user.username;
                } else if (event.meta?.from?.username) {
                  username = event.meta.from.username;
                } else if (event.meta?.username) {
                  username = event.meta.username;
                } else if (event.meta?.first_name) {
                  username = event.meta.first_name + (event.meta.last_name ? ' ' + event.meta.last_name : '');
                }
                
                participantActivity[userId] = { 
                  count: 0, 
                  username: username
                }
              }
              participantActivity[userId].count++
            });
          }
        }
        
        const topUsersList = Object.entries(participantActivity)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
        
        console.log('Top users list:', topUsersList);
        
        setTopUsers(topUsersList)
        
      } catch (e) {
        console.error('Error fetching analytics:', e)
        setAnalyticsError('Ошибка при загрузке аналитики: ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        setLoadingAnalytics(false)
      }
    }
    
    // Удалено дублирование вызова fetchAnalytics
  // Вызываем fetchAnalytics при изменении group или params.org
  useEffect(() => {
    if (group) {
      fetchAnalytics();
    }
  }, [group, params.org]);

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
        <>
          {group?.status === 'archived' && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              Группа помечена как архивная. Чтобы снова получать аналитику, верните боту @orbo_community_bot права администратора и добавьте группу повторно.
            </div>
          )}

          {error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : (
            <Tabs defaultValue="analytics">
              <TabsList className="mb-6">
                <TabsTrigger value="analytics">Аналитика</TabsTrigger>
                <TabsTrigger value="settings">Настройки</TabsTrigger>
              </TabsList>

              {group?.id !== undefined && (
                <div className="mb-4">
                  <RemoveGroupButton groupId={group.id} orgId={params.org} onRemoved={() => router.push(`/app/${params.org}/telegram`)} />
                </div>
              )}

              <TabsContent value="analytics">
                <div className="mb-4">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (group) {
                        setLoadingAnalytics(true);
                        fetchAnalytics();
                      }
                    }}
                    disabled={loadingAnalytics || !group}
                  >
                    {loadingAnalytics ? 'Загрузка...' : 'Обновить аналитику'}
                  </Button>
                </div>
                
                {analyticsError ? (
                  <div className="text-center py-8 text-red-500">{analyticsError}</div>
                ) : loadingAnalytics ? (
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

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle>Вовлеченность</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-neutral-500">Silent-кохорта</div>
                              <div className="text-xl font-semibold">{groupMetrics.silent_rate}%</div>
                              <div className="text-xs text-neutral-500">доля неактивных за 7 дней</div>
                            </div>
                            <div>
                              <div className="text-sm text-neutral-500">Активация новичков</div>
                              <div className="text-xl font-semibold">{groupMetrics.newcomer_activation}%</div>
                              <div className="text-xs text-neutral-500">активны в первые 72ч</div>
                            </div>
                            <div>
                              <div className="text-sm text-neutral-500">Равномерность</div>
                              <div className="text-xl font-semibold">{(1 - groupMetrics.activity_gini) * 100}%</div>
                              <div className="text-xs text-neutral-500">распределение активности</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle>Prime Time</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-6 gap-1">
                            {groupMetrics.prime_time.map((hour) => (
                              <div
                                key={hour.hour}
                                className={`text-center p-1 text-xs rounded ${
                                  hour.is_prime_time ? 'bg-blue-100 text-blue-800' : 'bg-gray-50'
                                }`}
                              >
                                {hour.hour}:00
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-neutral-500 mt-2 text-center">
                            Выделены часы пиковой активности
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="md:col-span-2">
                        <CardHeader className="pb-2">
                          <CardTitle>Risk Radar</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {groupMetrics.risk_radar.length > 0 ? (
                            <div className="space-y-3">
                              {groupMetrics.risk_radar.map((user) => (
                                <div key={user.tg_user_id} className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium">
                                      {user.username ? `@${user.username}` : `ID: ${user.tg_user_id}`}
                                    </div>
                                    <div className="text-xs text-neutral-500">
                                      Последняя активность: {new Date(user.last_activity).toLocaleDateString('ru')}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-4">
                                    <div className="text-sm">{user.message_count} сообщ.</div>
                                    <div className={`px-2 py-1 rounded text-sm ${
                                      user.risk_score >= 80 ? 'bg-red-100 text-red-800' :
                                      user.risk_score >= 60 ? 'bg-amber-100 text-amber-800' :
                                      'bg-blue-100 text-blue-800'
                                    }`}>
                                      Риск: {user.risk_score}%
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-neutral-500">
                              Нет участников с высоким риском оттока
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
        </>
      )}
    </AppShell>
  )
}
