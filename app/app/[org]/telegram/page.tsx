import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { AddGroupManuallyForm } from './form-components'
import { addGroupManually, deleteGroup } from './actions'
import AddVerifiedGroup from './add-verified-group'
import { notFound } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import TabsLayout from './tabs-layout'


type TelegramGroup = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  invite_link: string | null;
  bot_status: 'connected' | 'pending' | 'inactive' | null;
  last_sync_at: string | null;
};


export default async function TelegramPage({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем список подключенных групп через org_telegram_groups
    const { data: orgGroupsData, error: orgGroupsError } = await supabase
      .from('org_telegram_groups')
      .select(`
        telegram_groups!inner (
          id,
          tg_chat_id,
          title,
          invite_link,
          bot_status,
          last_sync_at
        )
      `)
      .eq('org_id', params.org)
    
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
      .eq('org_id', params.org)
    
    const memberCount = count || 0

      
    const supabase2 = await createClientServer()
    // Получаем список групп
    
    
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Telegram</h1>
        </div>
        
        <TabsLayout orgId={params.org}>
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
              
              <div className="flex gap-2 mt-4 flex-wrap">
                <Link href={`/app/${params.org}/telegram/account`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-black text-white hover:bg-black/85">
                  Настроить Telegram аккаунт
                </Link>
                <Link href={`/app/${params.org}/telegram/available-groups`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
                  Доступные группы
                </Link>
              </div>

               <AddVerifiedGroup orgId={params.org} />



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
                            <form action={async (formData) => {
                              const id = group.id;
                              const orgId = params.org;
                              
                              // Создаем FormData для вызова серверного актиона
                              formData.append('org', orgId);
                              formData.append('groupId', id.toString());
                              
                              // Вызов серверного актиона
                              await deleteGroup(formData);
                            }}>
                              <button 
                                type="submit" 
                                className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                              >
                                Удалить
                              </button>
                            </form>
                            {group.bot_status === 'pending' && (
                              <Link href={`/app/${params.org}/telegram/groups/${group.id}`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5">
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
