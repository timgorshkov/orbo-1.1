import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { CheckStatusForm, AddGroupManuallyForm } from './form-components'
import { checkStatus, addGroupManually, deleteGroup } from './actions'
import { notFound } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'


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
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', params.org)
    
    const memberCount = count || 0

      
    const supabase2 = createClientServer()
    // Получаем список групп
    const { data: telegramGroups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', params.org)
      .order('title')

    
    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram`} telegramGroups={telegramGroups || []}>
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
              
              <div className="flex gap-2 mt-4 flex-wrap">
                <a href={`/app/${params.org}/telegram/setup-telegram`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-black text-white hover:bg-black/85">
                  Настроить Telegram ID
                </a>
                <a href={`/app/${params.org}/telegram/check-groups`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5">
                  Проверить мои группы
                </a>
                <Link href={`/app/${params.org}/telegram/analytics`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5">
                  Общая аналитика
                </Link>
              </div>

              <CheckStatusForm orgId={params.org} action={checkStatus} />

              <AddGroupManuallyForm orgId={params.org} />



            </CardContent>
          </Card>
          
          {/* Список активных групп */}
          <Card>
            <CardHeader>
              <CardTitle>Активные группы</CardTitle>
            </CardHeader>
            <CardContent>
              {groups && groups.filter(g => g.bot_status === 'connected').length > 0 ? (
                <div className="space-y-4">
                  {groups
                    .filter(g => g.bot_status === 'connected')
                    .map(group => (
                      <div key={group.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">{group.title || `Группа ${group.tg_chat_id}`}</h3>
                            <div className="text-sm text-neutral-500">ID: {group.tg_chat_id}</div>
                            <div className="flex items-center mt-1">
                              <span className="inline-block w-2 h-2 rounded-full mr-2 bg-green-500" />
                              <span className="text-sm">Подключен</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Link href={`/app/${params.org}/telegram/groups/${group.id}`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5">
                              Управление группой
                            </Link>
                            <a href={`/app/${params.org}/telegram/message`} className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5">
                              Отправить сообщение
                            </a>
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
              ) : (
                <div className="text-center py-8">
                  <p className="text-neutral-500">
                    Нет активных групп. Добавьте бота @orbo_community_bot в группу и назначьте администратором.
                  </p>
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
