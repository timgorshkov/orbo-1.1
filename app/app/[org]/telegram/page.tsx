import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'

type TelegramGroup = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  invite_link: string | null;
  bot_status: string | null;
  last_sync_at: string | null;
};

// Server Action для проверки статуса бота
async function checkStatus(formData: FormData) {
  'use server'
  
  const org = String(formData.get('org'))
  try {
    const { supabase } = await requireOrgAccess(org)
    // Обновляем время синхронизации для демонстрации
    await supabase
      .from('telegram_groups')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('org_id', org)
    
    // В реальном приложении здесь можно вызвать API Telegram для проверки бота
    // или запустить Edge Function для синхронизации
    
  } catch (error) {
    console.error('Error checking status:', error)
  }
}

export default async function TelegramPage({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем список подключенных групп
    const { data: groups, error } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('org_id', params.org)
      .order('id') as { data: TelegramGroup[] | null, error: any }
    
    if (error) {
      console.error('Error fetching telegram groups:', error)
    }
    
    // Получаем общее количество участников в организации
    const { data: stats } = await supabase
      .from('participants')
      .select('id', { count: 'exact' })
      .eq('org_id', params.org)
    
    const memberCount = stats?.count || 0
    
    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram`}>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Telegram</h1>
        </div>
        
        <div className="grid gap-6">
          {/* Карточка подключения */}
          <Card>
            <CardHeader>
              <CardTitle>Подключение Telegram-группы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-neutral-600 space-y-3">
                <p>
                  <strong className="font-medium">1)</strong> Пригласите бота в вашу группу и назначьте администратором.
                </p>
                <p className="bg-neutral-50 rounded p-2 font-mono">
                  @orbo_community_bot
                </p>
                <p>
                  <strong className="font-medium">2)</strong> Нажмите «Проверить статус», чтобы начать синхронизацию участников и событий.
                </p>
              </div>
              
              <form action={checkStatus}>
                <input type="hidden" name="org" value={params.org} />
                <Button type="submit">Проверить статус</Button>
              </form>
            </CardContent>
          </Card>
          
          {/* Список подключенных групп */}
          <Card>
            <CardHeader>
              <CardTitle>Подключенные группы</CardTitle>
            </CardHeader>
            <CardContent>
              {groups && groups.length > 0 ? (
                <div className="space-y-4">
                  {groups.map(group => (
                    <div key={group.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{group.title || `Группа ${group.tg_chat_id}`}</h3>
                          <div className="text-sm text-neutral-500">ID: {group.tg_chat_id}</div>
                          <div className="flex items-center mt-1">
                            <span 
                              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                group.bot_status === 'connected' ? 'bg-green-500' : 'bg-amber-500'
                              }`} 
                            />
                            <span className="text-sm">
                              {group.bot_status === 'connected' ? 'Подключен' : 'В ожидании'}
                            </span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">Настройки</Button>
                      </div>
                      
                      {group.last_sync_at && (
                        <div className="mt-2 text-xs text-neutral-500">
                          Последняя синхронизация: {new Date(group.last_sync_at).toLocaleString('ru')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-neutral-500">
                    Нет подключенных групп. Добавьте бота @orbo_community_bot в группу и назначьте администратором.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Статистика */}
          {groups && groups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Статистика</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-neutral-500">Всего участников</div>
                    <div className="text-xl font-semibold">{memberCount}</div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-500">Подключено групп</div>
                    <div className="text-xl font-semibold">{groups.length}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <Button variant="outline">Запустить полную синхронизацию</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </AppShell>
    )
  } catch (error) {
    console.error('Telegram page error:', error)
    return notFound()
  }
}
