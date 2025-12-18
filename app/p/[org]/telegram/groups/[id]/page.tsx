'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClientBrowser } from '@/lib/client/supabaseClient'
import { RemoveGroupButton } from '@/components/telegram-group-actions'
import { AdminBadge } from '@/components/admin-badge'
import ImportHistory from '@/components/telegram/import-history'
import ActivityTimeline from '@/components/analytics/activity-timeline'
import TopContributors from '@/components/analytics/top-contributors'
import KeyMetrics from '@/components/analytics/key-metrics'
import ActivityHeatmap from '@/components/analytics/activity-heatmap'
import { ParticipantAvatar } from '@/components/members/participant-avatar'
import { createClientLogger } from '@/lib/logger'

type TelegramGroupSettings = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  bot_status: string | null;
  welcome_message: string | null;
  notification_enabled: boolean;
  last_sync_at: string | null;
  member_count: number | null;
  new_members_count: number | null;
  status: string;
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
    username: string | null;
    full_name: string | null;
    display_name?: string | null;
    risk_score: number;
    last_activity: string;
    message_count: number;
  }>;
}

export default function TelegramGroupPage({ params }: { params: { org: string, id: string } }) {
  const logger = createClientLogger('TelegramGroupPage', { org: params.org, group_id: params.id });
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [group, setGroup] = useState<any | null>(null)
  const [title, setTitle] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  // Аналитика
  const [metrics, setMetrics] = useState<any[]>([])
  const [groupMetrics, setGroupMetrics] = useState({
    message_count: 0,
    dau_avg: 0,
    reply_ratio_avg: 0,
    join_count: 0,
    leave_count: 0,
    member_percent_active: 0,
    member_active_count: 0,
    member_total_count: 0,
    silent_rate: 0,
    newcomer_activation: 0,
    activity_gini: 0,
    prime_time: [] as Array<{ hour: number; message_count: number; is_prime_time: boolean }>,
    risk_radar: [] as Array<{
      tg_user_id: number;
      username: string | null;
      full_name: string | null;
      display_name?: string | null;
      risk_score: number;
      last_activity: string;
      message_count: number;
    }>
  })
const [topUsers, setTopUsers] = useState<Array<{ tg_user_id: number; full_name: string | null; username: string | null; message_count: number; last_activity?: string }>>([])
  const [participants, setParticipants] = useState<Array<{ 
    tg_user_id: number | null; 
    participant_id: string | null;
    full_name: string | null; 
    username: string | null; 
    last_activity: string | null; 
    risk_score: number | null; 
    message_count: number;
    is_owner?: boolean;
    is_admin?: boolean;
    custom_title?: string | null;
    photo_url?: string | null;
  }>>([])
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)

  useEffect(() => {
    const fetchGroup = async () => {
      setLoading(true)
      try {
        logger.debug({ group_id: params.id, org: params.org }, 'Fetching group');

        if (!params.id) {
          setError('Не указан ID группы. Пожалуйста, вернитесь на страницу списка групп и выберите группу.');
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/telegram/groups/detail?orgId=${encodeURIComponent(params.org)}&groupId=${encodeURIComponent(params.id)}`);
        const data = await res.json();

        if (!res.ok || !data.group) {
          const message = data?.error || res.statusText || 'Не удалось загрузить данные группы';
          setError(`Не удалось загрузить данные группы: ${message}`);
          return;
        }

        const groupData = data.group;
        logger.debug({ 
          group_id: groupData.id,
          tg_chat_id: groupData.tg_chat_id,
          title: groupData.title,
          bot_status: groupData.bot_status
        }, 'Fetched group data');

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
        logger.error({
          error: e.message,
          stack: e.stack,
          group_id: params.id,
          org: params.org
        }, 'Error fetching group');
        setError('Произошла ошибка при загрузке данных: ' + (e.message || e));
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [params.id, params.org]);

  // Выносим функцию fetchAnalytics за пределы useEffect, чтобы её можно было вызывать из кнопки
  const fetchAnalytics = async () => {
      if (!group) {
        logger.debug({}, 'No group data available for analytics');
        return;
      }
      
      setLoadingAnalytics(true)
      setAnalyticsError(null)
      try {
        logger.debug({ 
          group_id: group.id,
          tg_chat_id: group.tg_chat_id,
          org: params.org
        }, 'Fetching analytics for group');
        
        // Используем более надежный подход с обработкой ошибок для каждого запроса
        // Создаем API запрос для получения данных через сервисную роль на сервере
        const apiUrl = `/api/telegram/analytics/data?orgId=${params.org}&groupId=${group.id}&chatId=${group.tg_chat_id}`;
        logger.debug({ api_url: apiUrl }, 'Fetching analytics from API');
        
        try {
          const analyticsResponse = await fetch(apiUrl);
          const analyticsData = await analyticsResponse.json();
          
          logger.debug({ 
            has_metrics: !!analyticsData.metrics,
            has_top_users: !!analyticsData.topUsers,
            has_participants: !!analyticsData.participants
          }, 'Analytics API response');
          
          if (analyticsData.error) {
            logger.error({
              error: analyticsData.error,
              group_id: group.id,
              org: params.org
            }, 'Analytics API error');
            setAnalyticsError('Ошибка при загрузке аналитики: ' + analyticsData.error);
            setLoadingAnalytics(false);
            return;
          }
          
          // Обновляем метрики из API
          if (analyticsData.metrics) {
            const totalMembers = analyticsData.metrics.member_count ?? 0
            const activeMembers = analyticsData.metrics.member_active_count ?? 0

            setGroupMetrics(prev => ({
              ...prev,
              message_count: analyticsData.metrics.message_count || 0,
              reply_ratio_avg: analyticsData.metrics.reply_ratio_avg || 0,
              dau_avg: analyticsData.metrics.dau_avg || 0,
              join_count: analyticsData.metrics.join_count || 0,
              leave_count: analyticsData.metrics.leave_count || 0,
              member_percent_active: totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) : 0,
              member_active_count: activeMembers,
              member_total_count: totalMembers,
              silent_rate: analyticsData.metrics.silent_rate || 0,
              newcomer_activation: analyticsData.metrics.newcomer_activation || 0,
              activity_gini: analyticsData.metrics.activity_gini || 0,
              prime_time: analyticsData.metrics.prime_time || [],
              risk_radar: analyticsData.metrics.risk_radar || []
            }))
          }
          
          // Обновляем топ пользователей из API
          if (analyticsData.topUsers) {
            setTopUsers(
              (analyticsData?.topUsers || []).map((user: any) => ({
                tg_user_id: user.tg_user_id,
                full_name: user.full_name ?? null,
                username: user.username ?? null,
                message_count: user.message_count ?? user.count ?? 0,
                last_activity: user.last_activity ?? null
              }))
            )
          }

          if (analyticsData.participants) {
            setParticipants(
              (analyticsData.participants || []).map((participant: any) => ({
                tg_user_id: participant.tg_user_id ?? null,
                participant_id: participant.participant_id ?? null,
                full_name: participant.full_name ?? null,
                username: participant.username ?? null,
                last_activity: participant.last_activity ?? null,
                risk_score: participant.risk_score ?? null,
                message_count: participant.message_count ?? 0,
                is_owner: participant.is_owner ?? false,
                is_admin: participant.is_admin ?? false,
                custom_title: participant.custom_title ?? null,
                photo_url: participant.photo_url ?? null
              }))
            )
          }
          
          // Обновляем дневные метрики из API
          if (analyticsData.dailyMetrics) {
            setMetrics(analyticsData.dailyMetrics);
          }
          
          setLoadingAnalytics(false);
          return;
        } catch (apiError: any) {
          logger.warn({
            error: apiError.message,
            stack: apiError.stack,
            group_id: group.id,
            org: params.org
          }, 'Error fetching from analytics API, using fallback');
          // Продолжаем с клиентским запросом как запасной вариант
        }
        
        // Запасной вариант - используем клиентский запрос
        const supabase = createClientBrowser();
        
        logger.debug({
          group_id: group.id,
          tg_chat_id: group.tg_chat_id,
          org_id: params.org,
          title: group.title
        }, 'Group data for analytics (fallback)');
        
        // Проверим напрямую наличие данных в activity_events
        const { data: activityCheck, error: activityError } = await supabase
          .from('activity_events')
          .select('id, event_type, created_at, tg_user_id')
          .eq('tg_chat_id', group.tg_chat_id)
          .order('created_at', { ascending: false })
          .limit(10);
          
        logger.debug({ 
          activity_count: activityCheck?.length || 0,
          has_error: !!activityError,
          error_code: activityError?.code
        }, 'Recent activity events check');
        
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
        
        logger.debug({ 
          has_metrics: !!timezonedMetrics,
          metrics_count: timezonedMetrics?.length || 0,
          has_error: !!tzError,
          error_code: tzError?.code
        }, 'Basic metrics result');
        
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
            logger.warn({
              error: silentRateError.message,
              error_code: silentRateError.code,
              group_id: group.id,
              org: params.org
            }, 'Error fetching silent_rate');
          }
          
          const silentRateResult = { data: silentRateData || 0 }
          silentRate = silentRateResult.data
          logger.debug({ silent_rate: silentRate }, 'Silent rate');
        } catch (e) {
          logger.error({
            error: e instanceof Error ? e.message : String(e),
            group_id: group.id,
            org: params.org
          }, 'Silent rate error');
        }
        
        try {
          const { data: newcomerData, error: newcomerError } = await supabase.rpc('get_newcomer_activation', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (newcomerError) {
            logger.warn({
              error: newcomerError.message,
              error_code: newcomerError.code,
              group_id: group.id,
              org: params.org
            }, 'Error fetching newcomer_activation');
          }
          
          const newcomerResult = { data: newcomerData || 0 }
          newcomerActivation = newcomerResult.data
          logger.debug({ newcomer_activation: newcomerActivation }, 'Newcomer activation');
        } catch (e) {
          logger.error({
            error: e instanceof Error ? e.message : String(e),
            group_id: group.id,
            org: params.org
          }, 'Newcomer activation error');
        }
        
        try {
          const { data: primeTimeData, error: primeTimeError } = await supabase.rpc('get_prime_time', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (primeTimeError) {
            logger.warn({
              error: primeTimeError.message,
              error_code: primeTimeError.code,
              group_id: group.id,
              org: params.org
            }, 'Error fetching prime_time');
          }
          
          const primeTimeResult = { data: primeTimeData || [] }
          primeTime = primeTimeResult.data || []
          logger.debug({ prime_time_count: primeTime.length }, 'Prime time');
        } catch (e) {
          logger.error({
            error: e instanceof Error ? e.message : String(e),
            group_id: group.id,
            org: params.org
          }, 'Prime time error');
        }
        
        try {
          const { data: giniData, error: giniError } = await supabase.rpc('get_activity_gini', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (giniError) {
            logger.warn({
              error: giniError.message,
              error_code: giniError.code,
              group_id: group.id,
              org: params.org
            }, 'Error fetching activity_gini');
          }
          
          const giniResult = { data: giniData || 0 }
          activityGini = giniResult.data
          logger.debug({ activity_gini: activityGini }, 'Activity gini');
        } catch (e) {
          logger.error({
            error: e instanceof Error ? e.message : String(e),
            group_id: group.id,
            org: params.org
          }, 'Activity gini error');
        }
        
        try {
          const { data: riskData, error: riskError } = await supabase.rpc('get_risk_radar', {
            org_id_param: params.org,
            tg_chat_id_param: group.tg_chat_id
          })
          
          if (riskError) {
            logger.warn({
              error: riskError.message,
              error_code: riskError.code,
              group_id: group.id,
              org: params.org
            }, 'Error fetching risk_radar');
          }
          
          const riskResult = { data: riskData || [] }
          riskRadar = riskResult.data || []
          logger.debug({ risk_radar_count: riskRadar.length }, 'Risk radar');
        } catch (e) {
          logger.error({
            error: e instanceof Error ? e.message : String(e),
            group_id: group.id,
            org: params.org
          }, 'Risk radar error');
        }
        
        let metricsData: any[] = [];
        
        if (!tzError && timezonedMetrics) {
          metricsData = timezonedMetrics;
        } else {
          logger.debug({
            error: tzError?.message,
            error_code: tzError?.code
          }, 'Using fallback metrics query');
          
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
        
        logger.debug({
          message_count: updatedMetrics.message_count,
          dau_avg: updatedMetrics.dau_avg,
          silent_rate: updatedMetrics.silent_rate,
          newcomer_activation: updatedMetrics.newcomer_activation,
          activity_gini: updatedMetrics.activity_gini,
          prime_time_count: updatedMetrics.prime_time?.length || 0,
          risk_radar_count: updatedMetrics.risk_radar?.length || 0
        }, 'Final metrics to display');
        setGroupMetrics(prev => ({ ...prev, ...updatedMetrics }));
        
        // Если DAU все равно 0, попробуем получить его напрямую из activity_events
        if (aggregatedMetrics.dau_avg === 0) {
          const sevenDaysAgo = new Date()
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
          
          logger.debug({ group_id: group.id }, 'DAU is 0, trying direct calculation from activity_events');
          
          // Используем более точный запрос для подсчета уникальных пользователей по дням
          const { data: dailyActiveUsers, error: dauError } = await supabase
            .from('activity_events')
            .select('tg_user_id, created_at')
            .eq('tg_chat_id', group.tg_chat_id)
            .eq('event_type', 'message')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1000)
            
          logger.debug({ 
            event_count: dailyActiveUsers?.length || 0,
            has_error: !!dauError,
            error_code: dauError?.code
          }, 'Direct DAU query result');
          
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
            logger.debug({ 
              days, 
              total_active_users: totalActiveUsers, 
              avg_dau: avgDau,
              users_by_day: Object.fromEntries(
                Object.entries(usersByDay).map(([day, users]) => [day, users.size])
              )
            }, 'Calculated DAU');
            
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
        // Остальной код будет использовать ответ API, поэтому локальная агрегация не требуется
        
      } catch (e) {
        logger.error({
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
          group_id: group.id,
          org: params.org
        }, 'Error fetching analytics');
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
        .eq('id', params.id)

      if (error) {
        throw new Error(error.message)
      }

      setSuccess(true)
    } catch (e: any) {
      logger.error({
        error: e.message,
        stack: e.stack,
        group_id: params.id,
        org: params.org
      }, 'Error saving group settings');
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
          groupId: params.id
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
        .eq('id', params.id)
        .single()

      if (!error && data) {
        setGroup(data)
        setTitle(data.title || '')
      }

      setSuccess(true)
    } catch (e: any) {
      logger.error({
        error: e.message,
        stack: e.stack,
        group_id: params.id,
        org: params.org
      }, 'Error refreshing group');
      setError(e.message || 'Произошла ошибка при обновлении')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {group?.title || 'Telegram группа'}
        </h1>
        <Button variant="outline" onClick={() => router.push(`/p/${params.org}/telegram`)}>
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
                <TabsTrigger value="members">Участники</TabsTrigger>
                <TabsTrigger value="import">Импорт истории</TabsTrigger>
                <TabsTrigger value="settings">Настройки</TabsTrigger>
              </TabsList>

              <TabsContent value="analytics">
                {group ? (
                  <div className="space-y-6">
                    {/* Activity Timeline + Heatmap */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <ActivityTimeline orgId={params.org} tgChatId={group.tg_chat_id.toString()} days={30} />
                      <ActivityHeatmap orgId={params.org} tgChatId={group.tg_chat_id.toString()} days={30} />
                    </div>

                    {/* Top Contributors + Key Metrics */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <TopContributors orgId={params.org} tgChatId={group.tg_chat_id.toString()} limit={10} />
                      <KeyMetrics orgId={params.org} tgChatId={group.tg_chat_id.toString()} periodDays={14} />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">Загрузка...</div>
                )}
              </TabsContent>

              <TabsContent value="members">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Участники группы</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {participants.length === 0 ? (
                      <div className="text-center py-6 text-neutral-500">Нет данных об участниках группы</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-neutral-200">
                          <thead className="bg-neutral-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Участник</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Username</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Роль</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Последняя активность</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Сообщений за 7 дней</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Риск оттока</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-neutral-200">
                            {participants.map(participant => {
                              const key = participant.tg_user_id
                                ? `tg-${participant.tg_user_id}`
                                : `anon-${participant.username ?? participant.full_name ?? Math.random().toString(36).slice(2)}`;
                              const displayName = participant.full_name || (participant.username ? `@${participant.username}` : participant.tg_user_id ? `ID: ${participant.tg_user_id}` : 'Неизвестный пользователь');
                              const handleRowClick = () => {
                                if (participant.participant_id) {
                                  router.push(`/p/${params.org}/members/${participant.participant_id}`);
                                }
                              };
                              return (
                                <tr 
                                  key={key}
                                  className={participant.participant_id ? "cursor-pointer hover:bg-gray-50" : ""}
                                  onClick={participant.participant_id ? handleRowClick : undefined}
                                >
                                  <td className="px-4 py-3 text-sm text-neutral-900">
                                    <div className="flex items-center gap-3">
                                      {participant.participant_id ? (
                                        <ParticipantAvatar
                                          participantId={participant.participant_id}
                                          photoUrl={participant.photo_url || null}
                                          tgUserId={participant.tg_user_id ? String(participant.tg_user_id) : null}
                                          displayName={displayName}
                                          size="sm"
                                        />
                                      ) : (
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                          {displayName.charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <span>{displayName}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-neutral-500">
                                    {participant.username ? `@${participant.username}` : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    <AdminBadge 
                                      isOwner={participant.is_owner}
                                      isAdmin={participant.is_admin}
                                      customTitle={participant.custom_title}
                                      size="sm"
                                      showLabel={true}
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-sm text-neutral-500">
                                    {participant.last_activity ? new Date(participant.last_activity).toLocaleString('ru') : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-neutral-500">
                                    {participant.message_count ?? 0}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    {participant.risk_score != null ? `${participant.risk_score}%` : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="import">
                <ImportHistory groupId={params.id} orgId={params.org} />
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
                    {group?.id !== undefined && (
                      <div className="pt-4 border-t border-neutral-200 flex justify-end">
                        <RemoveGroupButton
                          groupId={group.id}
                          orgId={params.org}
                          onRemoved={() => router.push(`/p/${params.org}/telegram`)}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  )
}
