import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notFound } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import Link from 'next/link'
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups'
import TabsLayout from '../tabs-layout'
import { createServiceLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic';

export default async function TelegramAnalyticsPage({ params }: { params: { org: string } }) {
  const logger = createServiceLogger('TelegramAnalyticsPage', { orgId: params.org });
  try {
    const { supabase: userSupabase, user } = await requireOrgAccess(params.org)
    
    // PostgreSQL admin client for all DB operations
    const supabase = createAdminServer()
    
    // Получаем список групп организации
    const groups = await getOrgTelegramGroups(params.org)
    
    if (!groups || groups.length === 0) {
      return (
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Telegram</h1>
          </div>
          
          <TabsLayout orgId={params.org}>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <p className="text-neutral-500">
                    Нет подключенных групп. Добавьте бота @orbo_community_bot в группу и назначьте администратором.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsLayout>
        </div>
      )
    }
    
    // Получаем метрики за последние 7 дней для всех групп
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    const lastWeekStr = lastWeek.toISOString().split('T')[0]
    
    const chatIds = groups.map(group => String(group.tg_chat_id));

    const { data: metrics } = chatIds.length > 0
      ? await supabase
        .from('group_metrics')
        .select('*')
        .in('tg_chat_id', chatIds)
        .gte('date', lastWeekStr)
        .order('date')
      : { data: [] }
    
    // Агрегируем метрики по группам
    const groupMetrics: Record<string, any> = {}
    
    if (metrics) {
      metrics.forEach(metric => {
        const key = String(metric.tg_chat_id);
        if (!groupMetrics[key]) {
          groupMetrics[key] = {
            message_count: 0,
            reply_count: 0,
            join_count: 0,
            leave_count: 0,
            dau_avg: 0,
            reply_ratio_avg: 0,
            days: 0
          }
        }
        
        groupMetrics[key].message_count += metric.message_count || 0
        groupMetrics[key].reply_count += metric.reply_count || 0
        groupMetrics[key].join_count += metric.join_count || 0
        groupMetrics[key].leave_count += metric.leave_count || 0
        groupMetrics[key].dau_avg += metric.dau || 0
        groupMetrics[key].reply_ratio_avg += metric.reply_ratio || 0
        groupMetrics[key].days++
      })
      
      // Вычисляем средние значения
      Object.keys(groupMetrics).forEach(chatId => {
        const days = groupMetrics[chatId].days || 1;
        groupMetrics[chatId].dau_avg = Math.round(groupMetrics[chatId].dau_avg / days);
        groupMetrics[chatId].reply_ratio_avg = Math.round(groupMetrics[chatId].reply_ratio_avg / days);
      })
    }
    
    const groupAnalytics: Record<string, {
      member_count: number
      member_active_count: number
    }> = {}

    for (const group of groups) {
      const chatId = String(group.tg_chat_id)
      groupAnalytics[chatId] = { member_count: 0, member_active_count: 0 }

      try {
        const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/telegram/analytics/data?orgId=${params.org}&chatId=${chatId}`
        const analyticsResponse = await fetch(apiUrl, { cache: 'no-store' })
        if (analyticsResponse.ok) {
          const analyticsPayload = await analyticsResponse.json()
          groupAnalytics[chatId] = {
            member_count: analyticsPayload?.metrics?.member_count ?? 0,
            member_active_count: analyticsPayload?.metrics?.member_active_count ?? 0
          }
        }
      } catch (analyticsError: any) {
        logger.warn({ 
          group_title: group.title, 
          chat_id: chatId,
          error: analyticsError?.message 
        }, 'Error loading analytics for group');
      }
    }

    const totalMembers = Object.values(groupAnalytics).reduce((sum, info) => sum + info.member_count, 0)
    const totalActiveMembers = Object.values(groupAnalytics).reduce((sum, info) => sum + info.member_active_count, 0)

    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Telegram</h1>
        </div>
        
        <TabsLayout orgId={params.org}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Общая статистика</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-neutral-500">Активных участников за 7 дней</div>
                  <div className="text-xl font-semibold">{totalActiveMembers}</div>
                </div>
                <div>
                  <div className="text-sm text-neutral-500">Всего участников</div>
                  <div className="text-xl font-semibold">{totalMembers}</div>
                </div>
                <div>
                  <div className="text-sm text-neutral-500">Всего сообщений за 7 дней</div>
                  <div className="text-xl font-semibold">
                    {Object.values(groupMetrics).reduce((sum: number, metric: any) => sum + metric.message_count, 0)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-neutral-500">Новых участников за 7 дней</div>
                  <div className="text-xl font-semibold">
                    {groups.reduce((sum: number, group: any) => sum + (group.new_members_count || 0), 0)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Средние показатели</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-neutral-500">Сообщений в день</div>
                  <div className="text-xl font-semibold">
                    {Math.round(Object.values(groupMetrics).reduce((sum: number, metric: any) => sum + metric.message_count, 0) / 7)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-neutral-500">Средний коэффициент ответов</div>
                  <div className="text-xl font-semibold">
                    {Math.round(Object.values(groupMetrics).reduce((sum: number, metric: any) => sum + metric.reply_ratio_avg, 0) / Math.max(1, Object.keys(groupMetrics).length))}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-neutral-500">Активных пользователей (DAU)</div>
                  <div className="text-xl font-semibold">
                    {Math.round(Object.values(groupMetrics).reduce((sum: number, metric: any) => sum + metric.dau_avg, 0))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-neutral-500">Чистый прирост участников</div>
                  <div className="text-xl font-semibold">
                    {groups.reduce((sum: number, group: any) => sum + (group.new_members_count || 0), 0) - 
                     Object.values(groupMetrics).reduce((sum: number, metric: any) => sum + (metric.leave_count || 0), 0)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <h2 className="text-xl font-medium mb-4">Статистика по группам</h2>
        
        <div className="space-y-6">
          {groups.map(group => (
            <Card key={group.id}>
              <CardHeader className="pb-2">
                <CardTitle>{group.title || `Группа ${group.tg_chat_id}`}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-neutral-500">Активных участников</div>
                    <div className="text-xl font-semibold">
                      {groupAnalytics[String(group.tg_chat_id)]?.member_active_count ?? groupAnalytics[String(group.tg_chat_id)]?.member_count ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Всего участников</div>
                    <div className="text-xl font-semibold">
                      {groupAnalytics[String(group.tg_chat_id)]?.member_count ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Сообщений за 7 дней</div>
                    <div className="text-xl font-semibold">
                      {groupMetrics[String(group.tg_chat_id)]?.message_count || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Активных пользователей (DAU)</div>
                    <div className="text-xl font-semibold">
                      {groupMetrics[String(group.tg_chat_id)]?.dau_avg || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Коэффициент ответов</div>
                    <div className="text-xl font-semibold">
                      {groupMetrics[String(group.tg_chat_id)]?.reply_ratio_avg || 0}%
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-neutral-500">Новых участников</div>
                    <div className="text-xl font-semibold">{group.new_members_count || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Ушло участников</div>
                    <div className="text-xl font-semibold">{groupMetrics[String(group.tg_chat_id)]?.leave_count || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Чистый прирост</div>
                    <div className="text-xl font-semibold">
                      {(groupMetrics[String(group.tg_chat_id)]?.join_count || 0) - (groupMetrics[String(group.tg_chat_id)]?.leave_count || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Статус</div>
                    <div className="text-xl font-semibold flex items-center">
                      <span 
                        className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          group.bot_status === 'connected' ? 'bg-green-500' : 
                          group.bot_status === 'pending' ? 'bg-amber-500' : 'bg-red-500'
                        }`} 
                      />
                      {group.bot_status === 'connected' ? 'Активна' : 
                       group.bot_status === 'pending' ? 'Ожидание' : 'Неактивна'}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <Link 
                    href={`/app/${params.org}/telegram/groups/${group.id}`} 
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Управление группой →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </TabsLayout>
      </div>
    )
  } catch (error: any) {
    logger.error({ error: error?.message || String(error) }, 'Telegram analytics page error');
    return notFound()
  }
}
