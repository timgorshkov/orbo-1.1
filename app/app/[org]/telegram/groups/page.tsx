import { requireOrgAccess } from '@/lib/orgGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import TabsLayout from '../tabs-layout';
import { createServiceLogger } from '@/lib/logger';

type TelegramGroup = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  bot_status: 'connected' | 'pending' | 'inactive' | null;
  last_sync_at: string | null;
  member_count?: number;
  last_activity_at?: string | null;
};

export default async function TelegramGroupsListPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const logger = createServiceLogger('TelegramGroupsListPage', { orgId: org });
  try {
    const { supabase } = await requireOrgAccess(org);

    // Получаем список подключенных групп через org_telegram_groups
    const { data: orgGroupLinks, error: linksError } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', org);

    let groups: TelegramGroup[] | null = null;

    if (orgGroupLinks && !linksError && orgGroupLinks.length > 0) {
      const chatIds = orgGroupLinks.map(link => link.tg_chat_id);
      const { data: telegramGroups, error: groupsError } = await supabase
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status, last_sync_at, member_count, last_activity_at')
        .in('tg_chat_id', chatIds);
      
      if (groupsError) {
        logger.error({ error: groupsError.message }, 'Error fetching telegram groups');
      } else {
        groups = (telegramGroups || [])
          .sort((a, b) => (a.id || 0) - (b.id || 0)) as TelegramGroup[];
      }
    }

    if (linksError) {
      logger.error({ error: linksError.message }, 'Error fetching org_telegram_groups');
    }

    const activeGroups = groups?.filter(g => g.bot_status === 'connected') || [];
    const pendingGroups = groups?.filter(g => g.bot_status === 'pending' || g.bot_status === 'inactive') || [];

    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Telegram Группы</h1>
        </div>

        <TabsLayout orgId={org}>
          <div className="grid gap-6">
            {/* Активные группы */}
            {activeGroups.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Активные группы ({activeGroups.length})</CardTitle>
                  <Link
                    href={`/app/${org}/telegram/available-groups`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Добавить группу
                  </Link>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {activeGroups.map(group => (
                      <div
                        key={group.id}
                        className="border rounded-lg p-4 hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-lg">
                                {group.title || `Группа ${group.tg_chat_id}`}
                              </h3>
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
                                Активна
                              </span>
                            </div>

                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="text-neutral-500">Chat ID</div>
                                <div className="font-mono">{group.tg_chat_id}</div>
                              </div>
                              <div>
                                <div className="text-neutral-500">Участников</div>
                                <div className="font-medium">{group.member_count || 0}</div>
                              </div>
                              {group.last_activity_at && (
                                <div className="col-span-2">
                                  <div className="text-neutral-500">Последняя активность</div>
                                  <div>{new Date(group.last_activity_at).toLocaleString('ru-RU')}</div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="ml-4">
                            <Link
                              href={`/app/${org}/telegram/groups/${group.id}`}
                              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                            >
                              Управление
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Ожидающие группы */}
            {pendingGroups.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Ожидающие и неактивные группы ({pendingGroups.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {pendingGroups.map(group => (
                      <div key={group.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">{group.title || `Группа ${group.tg_chat_id}`}</h3>
                            <div className="text-sm text-neutral-500 mt-1">ID: {group.tg_chat_id}</div>
                            <div className="flex items-center mt-2">
                              <span
                                className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                  group.bot_status === 'pending' ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                              />
                              <span className="text-sm">
                                {group.bot_status === 'pending' ? 'В ожидании' : 'Неактивна'}
                              </span>
                            </div>
                          </div>
                          <Link
                            href={`/app/${org}/telegram/groups/${group.id}`}
                            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border border-neutral-300 hover:bg-neutral-50"
                          >
                            Управление
                          </Link>
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

            {/* Пусто */}
            {(!groups || groups.length === 0) && (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="text-5xl mb-4">📢</div>
                  <h3 className="text-lg font-medium mb-2">Нет подключенных групп</h3>
                  <p className="text-neutral-500 mb-6">
                    Добавьте вашу первую Telegram группу для начала работы
                  </p>
                  <Link
                    href={`/app/${org}/telegram`}
                    className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Подключить группу
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsLayout>
      </div>
    );
  } catch (error: any) {
    logger.error({ error: error?.message || String(error) }, 'Telegram groups list page error');
    return notFound();
  }
}


