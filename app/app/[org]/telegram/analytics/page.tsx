import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notFound } from 'next/navigation'

export default async function TelegramAnalyticsPage({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем список групп организации
    const { data: groups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id, bot_status')
      .eq('org_id', params.org)
      .order('title')
    
    if (!groups || groups.length === 0) {
      return (
        <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram/analytics`} telegramGroups={[]}>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Аналитика Telegram</h1>
          </div>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <p className="text-neutral-500">
                  Нет подключенных групп. Добавьте бота @orbo_community_bot в группу и назначьте администратором.
                </p>
              </div>
            </CardContent>
          </Card>
        </AppShell>
      )
    }
    
    // Получаем метрики за последние 7 дней для всех групп
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    const lastWeekStr = lastWeek.toISOString().split('T')[0]
    
    const { data: metrics } = await supabase
      .from('group_metrics')
      .select('*')
      .eq('org_id', params.org)
      .gte('date', lastWeekStr)
      .order('date')
    
    // Агрегируем метрики по группам
    const groupMetrics: Record<number, any> = {}
    
    if (metrics) {
      metrics.forEach(metric => {
        if (!groupMetrics[metric.tg_chat_id]) {
          groupMetrics[metric.tg_chat_id] = {
            message_count: 0,
            reply_count: 0,
            join_count: 0,
            leave_count: 0,
            dau_avg: 0,
            reply_ratio_avg: 0,
            days: 0
          }
        }
        
        groupMetrics[metric.tg_chat_id].message_count += metric.message_count || 0
        groupMetrics[metric.tg_chat_id].reply_count += metric.reply_count || 0
        groupMetrics[metric.tg_chat_id].join_count += metric.join_count || 0
        groupMetrics[metric.tg_chat_id].leave_count += metric.leave_count || 0
        groupMetrics[metric.tg_chat_id].dau_avg += metric.dau || 0
        groupMetrics[metric.tg_chat_id].reply_ratio_avg += metric.reply_ratio || 0
        groupMetrics[metric.tg_chat_id].days++
      })
      
      // Вычисляем средние значения
      Object.keys(groupMetrics).forEach(chatId => {
        const numChatId = Number(chatId);
        const days = groupMetrics[numChatId].days || 1;
        groupMetrics[numChatId].dau_avg = Math.round(groupMetrics[numChatId].dau_avg / days);
        groupMetrics[numChatId].reply_ratio_avg = Math.round(groupMetrics[numChatId].reply_ratio_avg / days);
      })
    }
    
    // Получаем общее количество участников для каждой группы
    const groupMemberCounts: Record<number, number> = {}
    
    for (const group of groups) {
      const { count } = await supabase
        .from('activity_events')
        .select('tg_user_id', { count: 'exact', head: true })
        .eq('tg_chat_id', group.tg_chat_id)
        .eq('event_type', 'join')
      
      const { count: leaveCount } = await supabase
        .from('activity_events')
        .select('tg_user_id', { count: 'exact', head: true })
        .eq('tg_chat_id', group.tg_chat_id)
        .eq('event_type', 'leave')
      
      groupMemberCounts[group.tg_chat_id] = (count || 0) - (leaveCount || 0)
    }
    
    // Получаем список телеграм-групп для AppShell
    const { data: telegramGroups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', params.org)
      .order('title')
    
    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram/analytics`} telegramGroups={telegramGroups || []}>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Аналитика Telegram</h1>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Общая статистика</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-neutral-500">Всего групп</div>
                  <div className="text-xl font-semibold">{groups.length}</div>
                </div>
                <div>
                  <div className="text-sm text-neutral-500">Активных групп</div>
                  <div className="text-xl font-semibold">{groups.filter(g => g.bot_status === 'connected').length}</div>
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
                    {Object.values(groupMetrics).reduce((sum: number, metric: any) => sum + metric.join_count, 0)}
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
                    {Object.values(groupMetrics).reduce((sum: number, metric: any) => sum + metric.join_count - metric.leave_count, 0)}
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
                    <div className="text-sm text-neutral-500">Участников</div>
                    <div className="text-xl font-semibold">{groupMemberCounts[group.tg_chat_id] || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Сообщений за 7 дней</div>
                    <div className="text-xl font-semibold">{groupMetrics[group.tg_chat_id]?.message_count || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Активных пользователей (DAU)</div>
                    <div className="text-xl font-semibold">{groupMetrics[group.tg_chat_id]?.dau_avg || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Коэффициент ответов</div>
                    <div className="text-xl font-semibold">{groupMetrics[group.tg_chat_id]?.reply_ratio_avg || 0}%</div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-neutral-500">Новых участников</div>
                    <div className="text-xl font-semibold">{groupMetrics[group.tg_chat_id]?.join_count || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Ушло участников</div>
                    <div className="text-xl font-semibold">{groupMetrics[group.tg_chat_id]?.leave_count || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Чистый прирост</div>
                    <div className="text-xl font-semibold">
                      {(groupMetrics[group.tg_chat_id]?.join_count || 0) - (groupMetrics[group.tg_chat_id]?.leave_count || 0)}
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
                  <a 
                    href={`/app/${params.org}/telegram/analytics/${group.id}`} 
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Подробная аналитика →
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </AppShell>
    )
  } catch (error) {
    console.error('Telegram analytics page error:', error)
    return notFound()
  }
}
