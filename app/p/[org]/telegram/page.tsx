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
import { createServiceLogger } from '@/lib/logger'


type TelegramGroup = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  bot_status: 'connected' | 'pending' | 'inactive' | null;
  last_sync_at: string | null;
  access_status?: string;
};


export default async function TelegramPage({ params }: { params: Promise<{ org: string }> }) {
  const logger = createServiceLogger('TelegramPage');
  try {
    const { org: orgId } = await params
    const { supabase, user, role } = await requireOrgAccess(orgId)

    // Проверяем, подключён ли верифицированный Telegram-аккаунт для данной организации
    const { data: tgAccount } = await supabase
      .from('user_telegram_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('is_verified', true)
      .limit(1)
      .maybeSingle()
    const hasTelegramAccount = !!tgAccount

    // Получаем список подключенных групп через org_telegram_groups
    const { data: orgGroupLinks, error: linksError } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, status')
      .eq('org_id', orgId)
    
    let groups: TelegramGroup[] | null = null
    let error = linksError
    
    if (orgGroupLinks && !linksError && orgGroupLinks.length > 0) {
      const chatIds = orgGroupLinks.map(link => link.tg_chat_id);
      const statusMap = new Map(orgGroupLinks.map(link => [String(link.tg_chat_id), link.status]))
      const { data: telegramGroups, error: groupsError } = await supabase
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status, last_sync_at')
        .in('tg_chat_id', chatIds);
      
      error = groupsError;
      groups = ((telegramGroups || []) as TelegramGroup[])
        .map(g => ({ ...g, access_status: statusMap.get(String(g.tg_chat_id)) || 'active' }))
        .sort((a, b) => (a.id || 0) - (b.id || 0))
    }
    
    if (error) {
      logger.error({ 
        error: error.message,
        error_code: error.code,
        org_id: orgId
      }, 'Error fetching telegram groups');
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
          <h1 className="text-2xl font-semibold">Настройки мессенджеров</h1>
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
                  {!hasTelegramAccount ? (
                    // Шаг 0: аккаунт не подключён — это первое, что нужно сделать
                    <div className="space-y-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
                        <p className="font-medium mb-1">Сначала подключите Telegram-аккаунт</p>
                        <p className="text-amber-800">Чтобы видеть доступные группы и подключать их, необходимо привязать ваш личный Telegram-аккаунт к Orbo.</p>
                      </div>
                      <Link
                        href={`/p/${orgId}/telegram/account`}
                        className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 w-full"
                      >
                        Подключить Telegram-аккаунт
                      </Link>
                      <div className="border-t pt-4 text-sm text-neutral-500 space-y-2">
                        <p className="font-medium text-neutral-700">После подключения аккаунта:</p>
                        <p><strong className="font-medium">1)</strong> Пригласите бота <span className="font-mono bg-neutral-100 px-1 rounded">@orbo_community_bot</span> в вашу группу и назначьте его администратором.</p>
                        <p><strong className="font-medium">2)</strong> Откройте «Доступные группы» и подключите нужную группу к организации.</p>
                      </div>
                    </div>
                  ) : (
                    // Аккаунт подключён — показываем инструкцию и кнопку групп
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
                  )}
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
          
          {/* Access revoked groups warning */}
          {groups && groups.filter(g => g.access_status === 'access_revoked').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  Доступ отозван
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-800 mb-3">
                  Ни один администратор организации не является администратором следующих Telegram-групп. 
                  Отправка анонсов в эти группы заблокирована.
                </p>
                <div className="space-y-2">
                  {groups
                    .filter(g => g.access_status === 'access_revoked')
                    .map(group => (
                      <div key={group.id} className="flex items-center justify-between border border-red-200 bg-red-50 rounded-lg p-3">
                        <div>
                          <h3 className="font-medium text-sm text-red-900">{group.title || `Группа ${group.tg_chat_id}`}</h3>
                          <p className="text-xs text-red-700">ID: {group.tg_chat_id}</p>
                        </div>
                        <DeleteGroupButton
                          groupId={group.id}
                          groupTitle={group.title}
                          orgId={orgId}
                        />
                      </div>
                    ))}
                </div>
                <p className="text-xs text-red-600 mt-3">
                  Чтобы восстановить доступ, убедитесь, что владелец или администратор организации 
                  является администратором этих групп в Telegram, и выполните синхронизацию.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Статистика */}
          </div>
        </TabsLayout>
      </div>
    )
  } catch (error) {
    // Unauthorized/Forbidden are expected for unauthenticated users - redirect silently
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage === 'Unauthorized' || errorMessage === 'Forbidden') {
      // Don't log expected auth errors
      return notFound()
    }
    logger.error({ 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      org_id: (await params).org
    }, 'Telegram page error');
    return notFound()
  }
}
