import { requireOrgAccess } from '@/lib/orgGuard'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import '../../../globals.css';
import { getOrgInfoWithClient } from '@/lib/getOrgInfo';

type ActivityEvent = {
  id: number;
  type: 'join' | 'leave' | 'message' | 'checkin';
  created_at: string;
  participant: { id: string; full_name: string; username: string | null };
};

type DashboardStats = {
  total_participants: number;
  new_7d: number;
  left_7d: number;
};

export default async function Dashboard({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем информацию об организации
    const orgInfo = await getOrgInfoWithClient(supabase, params.org)

    // Получаем статистику через RPC
    const { data: statsData, error: statsError } = await supabase.rpc(
      'org_dashboard_stats', 
      { _org: params.org }
    )
    
    if (statsError) {
      console.error('Error fetching stats:', statsError)
    }
    
    // Парсим JSON результат из RPC
    const stats: DashboardStats = statsData || { 
      total_participants: 0, 
      new_7d: 0, 
      left_7d: 0 
    }

    // Получаем последние события активности
    const { data: recentActivity } = await supabase
      .from('activity_events')
      .select(`
        id, 
        type, 
        created_at,
        participant:participant_id (
          id,
          full_name,
          username
        )
      `)
      .eq('org_id', params.org)
      .order('created_at', { ascending: false })
      .limit(10) as { data: ActivityEvent[] | null }
    
    // Получаем список "неактивных" участников (не было активности > 14 дней)
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    
    const { data: inactiveMembers } = await supabase
      .from('participants')
      .select('id, full_name, username')
      .eq('org_id', params.org)
      .not('id', 'in', (subquery: typeof supabase) => 
        subquery
          .from('activity_events')
          .select('participant_id')
          .eq('org_id', params.org)
          .gte('created_at', twoWeeksAgo.toISOString())
      )
      .limit(5)

    const { data: telegramGroups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', params.org)
      .order('title')
    
    return (
      <AppShell 
        orgId={params.org} 
        currentPath={`/app/${params.org}/dashboard`} 
        telegramGroups={telegramGroups || []} 
        orgName={orgInfo?.name}
      >
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Дашборд</h1>
        </div>
        
        {/* Метрики */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Участников</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{stats.total_participants}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>+ за 7 дней</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{stats.new_7d}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Вышло за 7 дней</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{stats.left_7d}</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Активность и список внимания */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Последние события</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity && recentActivity.length > 0 ? (
                <ul className="space-y-2">
                  {recentActivity.map(event => (
                    <li key={event.id} className="text-sm text-neutral-700">
                      <span className="inline-flex min-w-20 uppercase text-xs mr-2 rounded-md bg-black/5 px-2 py-1">
                        {event.type}
                      </span>
                      {event.participant?.full_name || 'Пользователь'} 
                      {event.participant?.username && <span className="text-neutral-500"> @{event.participant.username}</span>}
                      <span className="text-neutral-500 ml-2">
                        {new Date(event.created_at).toLocaleString('ru', { 
                          day: 'numeric', 
                          month: 'short',
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">Нет недавних событий</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Список внимания</CardTitle>
            </CardHeader>
            <CardContent>
              {inactiveMembers && inactiveMembers.length > 0 ? (
                <ul className="space-y-2">
                  {inactiveMembers.map(member => (
                    <li key={member.id} className="text-sm text-neutral-700">
                      <div>{member.full_name}</div>
                      {member.username && <div className="text-xs text-neutral-500">@{member.username}</div>}
                      <div className="text-xs text-amber-600">Нет активности более 14 дней</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">Нет неактивных участников</p>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    )
  } catch (error) {
    console.error('Dashboard error:', error)
    return notFound()
  }
}
