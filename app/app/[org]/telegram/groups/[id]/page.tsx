import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notFound } from 'next/navigation'

export default async function TelegramGroupPage({ 
  params 
}: { 
  params: { org: string; id: string } 
}) {
  const { supabase } = await requireOrgAccess(params.org)
  
  // Получаем информацию о группе
  const { data: group, error } = await supabase
    .from('telegram_groups')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', params.org)
    .single()
  
  if (error || !group) {
    return notFound()
  }
  
  // Получаем последние события в группе
  const { data: events } = await supabase
    .from('activity_events')
    .select('*')
    .eq('org_id', params.org)
    .eq('tg_group_id', group.tg_chat_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Получаем список групп
 const { data: telegramGroups } = await supabase
    .from('telegram_groups')
    .select('id, title, tg_chat_id')
    .eq('org_id', params.org)
    .order('title')
  
  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram/groups/${params.id}`} telegramGroups={telegramGroups || []}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{group.title || `Группа ${group.tg_chat_id}`}</h1>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Информация о группе</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <span className="text-sm text-neutral-500">ID группы:</span>
                <div>{group.tg_chat_id}</div>
              </div>
              
              <div>
                <span className="text-sm text-neutral-500">Статус бота:</span>
                <div className="flex items-center">
                  <span 
                    className={`inline-block w-2 h-2 rounded-full mr-2 ${
                      group.bot_status === 'connected' ? 'bg-green-500' : 'bg-amber-500'
                    }`} 
                  />
                  <span>
                    {group.bot_status === 'connected' ? 'Подключен' : 'В ожидании'}
                  </span>
                </div>
              </div>
              
              {group.invite_link && (
                <div>
                  <span className="text-sm text-neutral-500">Пригласительная ссылка:</span>
                  <div>
                    <a href={group.invite_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 break-all">
                      {group.invite_link}
                    </a>
                  </div>
                </div>
              )}
              
              <div>
                <span className="text-sm text-neutral-500">Последняя синхронизация:</span>
                <div>
                  {group.last_sync_at ? new Date(group.last_sync_at).toLocaleString('ru') : 'Никогда'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Последние события</CardTitle>
          </CardHeader>
          <CardContent>
            {events && events.length > 0 ? (
              <div className="space-y-3">
                {events.map(event => (
                  <div key={event.id} className="border-b pb-2">
                    <div className="text-sm">
                      {event.type === 'message' && '💬 Сообщение'}
                      {event.type === 'join' && '👋 Новый участник'}
                      {event.type === 'leave' && '🚶 Участник покинул группу'}
                      {event.type === 'command' && '🤖 Команда бота'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {new Date(event.created_at).toLocaleString('ru')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-neutral-500">
                Нет зарегистрированных событий
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
