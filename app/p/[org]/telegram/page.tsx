import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { AddGroupManuallyForm } from './form-components'
import { addGroupManually } from './actions'
import { DeleteGroupButton } from './delete-group-button'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TabsLayout from './tabs-layout'


type TelegramGroup = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  bot_status: 'connected' | 'pending' | 'inactive' | null;
  last_sync_at: string | null;
};


export default async function TelegramPage({ params }: { params: Promise<{ org: string }> }) {
  try {
    const { org: orgId } = await params
    const { supabase, role } = await requireOrgAccess(orgId)
    
    // Получаем список подключенных групп через org_telegram_groups
    const { data: orgGroupsData, error: orgGroupsError } = await supabase
      .from('org_telegram_groups')
      .select(`
        telegram_groups!inner (
          id,
          tg_chat_id,
          title,
          bot_status,
          last_sync_at
        )
      `)
      .eq('org_id', orgId)
    
    let groups: TelegramGroup[] | null = null
    let error = orgGroupsError
    
    if (orgGroupsData && !orgGroupsError) {
      // Извлекаем telegram_groups из результата JOIN
      // Supabase возвращает связанную запись как объект (не массив) для foreign key
      groups = (orgGroupsData as any[])
        .map((item: any) => item.telegram_groups as TelegramGroup)
        .filter((group: TelegramGroup | null): group is TelegramGroup => group !== null)
        .sort((a, b) => (a.id || 0) - (b.id || 0)) as TelegramGroup[]
    }
    
    if (error) {
      console.error('Error fetching telegram groups:', error)
    }
    
    // Получаем общее количество участников в организации
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
    
    const memberCount = count || 0

      
    const supabase2 = await createClientServer()
    // Получаем список групп
    
    
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Telegram</h1>
        </div>
        
        <TabsLayout orgId={orgId}>
          <div className="grid gap-6">
          {/* Карточка подключения */}
          <Card>
            <CardHeader>
              <CardTitle>Подключение Telegram-группы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {role === 'owner' ? (
                // ✅ Блок для владельца организации
                <>
                  <div className="text-sm text-neutral-600 space-y-3">
                    <p>
                      <strong className="font-medium">1)</strong> Пригласите бота в вашу группу и назначьте администратором.
                    </p>
                    <p className="bg-neutral-50 rounded p-2 font-mono">
                      @orbo_community_bot
                    </p>
                    <p>
                      <strong className="font-medium">2)</strong> Нажмите «Доступные группы», чтобы увидеть список групп, в которых вы являетесь администратором, и подключить их к организации.
                    </p>
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    <Link href={`/p/${orgId}/telegram/available-groups`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
                      Доступные группы
                    </Link>
                  </div>
                  
                  <div className="border-t pt-4">
                    <Link href={`/p/${orgId}/telegram/account`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-neutral-300 hover:bg-neutral-50 w-full">
                      Настроить Telegram-аккаунт
                    </Link>
                    <p className="mt-2 text-xs text-neutral-500 text-center">
                      Необходимо для получения списка ваших групп
                    </p>
                  </div>
                </>
              ) : (
                // ✅ Блок для администратора
                <div className="text-sm text-neutral-600 space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="font-medium text-blue-900 mb-2">
                      ℹ️ Подключение групп доступно только владельцу организации
                    </p>
                    <p className="text-blue-800">
                      Группы к организации подключает владелец. Если вы хотите добавить свою группу:
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <p>
                      <strong className="font-medium">1.</strong> Добавьте в вашу группу бота:
                    </p>
                    <p className="bg-neutral-50 rounded p-2 font-mono">
                      @orbo_community_bot
                    </p>
                    
                    <p>
                      <strong className="font-medium">2.</strong> Добавьте владельца организации в группу с правами администратора
                    </p>
                    
                    <p>
                      <strong className="font-medium">3.</strong> Попросите владельца подключить группу к организации через раздел «Доступные группы»
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    💡 После добавления группы вы сможете управлять ей как администратор
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Список ожидающих групп */}
          {groups && groups.filter(g => g.bot_status === 'pending' || g.bot_status === 'inactive').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ожидающие и неактивные группы</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {groups
                    .filter(g => g.bot_status === 'pending' || g.bot_status === 'inactive')
                    .map(group => (
                      <div key={group.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">{group.title || `Группа ${group.tg_chat_id}`}</h3>
                            <div className="text-sm text-neutral-500">ID: {group.tg_chat_id}</div>
                            <div className="flex items-center mt-1">
                              <span 
                                className={`inline-block w-2 h-2 rounded-full mr-2 ${group.bot_status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`}
                              />
                              <span className="text-sm">
                                {group.bot_status === 'pending' ? 'В ожидании' : 'Неактивна'}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <DeleteGroupButton
                              groupId={group.id}
                              groupTitle={group.title}
                              orgId={orgId}
                            />
                            {group.bot_status === 'pending' && (
                              <Link href={`/p/${orgId}/telegram/groups/${group.id}`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5">
                                Управление группой
                              </Link>
                            )}
                          </div>
                        </div>
                        
                        {group.last_sync_at && (
                          <div className="mt-2 text-xs text-neutral-500">
                            Последняя синхронизация: {new Date(group.last_sync_at).toLocaleString('ru')}
                          </div>
                        )}
                      </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Статистика */}
          </div>
        </TabsLayout>
      </div>
    )
  } catch (error) {
    console.error('Telegram page error:', error)
    return notFound()
  }
}
