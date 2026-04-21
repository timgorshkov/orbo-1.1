'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, RefreshCw, Plus, Loader2, CheckCircle2, XCircle, Clock, Unplug, ChevronRight, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';

interface MaxGroup {
  id: string;
  max_chat_id: number;
  title: string | null;
  bot_status: string;
  member_count: number | null;
  last_sync_at: string | null;
  created_at: string;
  link_status?: string;
}

interface GroupHealthStatus {
  bot_in_group: boolean;
  bot_is_admin: boolean;
  bot_can_send: boolean;
  group_title: string;
  member_count: number;
  bot_status: string;
  warning?: string;
  checked_at?: string;
}

interface MaxGroupsClientProps {
  orgId: string;
  linkedGroups: MaxGroup[];
  availableGroups: MaxGroup[];
  mainBotUsername: string | null;
}

export default function MaxGroupsClient({ orgId, linkedGroups, availableGroups, mainBotUsername }: MaxGroupsClientProps) {
  const [linked, setLinked] = useState<MaxGroup[]>(linkedGroups);
  const [available, setAvailable] = useState<MaxGroup[]>(availableGroups);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [healthMap, setHealthMap] = useState<Record<string, GroupHealthStatus>>({});
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // On-demand проверка статуса при открытии страницы
  const checkGroupStatus = useCallback(async (group: MaxGroup) => {
    const chatId = String(group.max_chat_id);
    setChecking(chatId);
    try {
      const res = await fetch('/api/max/groups/check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, max_chat_id: group.max_chat_id }),
      });
      const data = await res.json();
      setHealthMap(prev => ({ ...prev, [chatId]: data }));

      // Обновить bot_status и member_count в linked state
      if (data.bot_status) {
        setLinked(prev => prev.map(g =>
          String(g.max_chat_id) === chatId
            ? { ...g, bot_status: data.bot_status, member_count: data.member_count || g.member_count, title: data.group_title || g.title }
            : g
        ));
      }
    } catch {
      // тихо — не блокируем UI
    } finally {
      setChecking(null);
    }
  }, [orgId]);

  // Проверяем все привязанные группы при открытии страницы
  useEffect(() => {
    if (initialCheckDone || linked.length === 0) return;
    setInitialCheckDone(true);
    // Последовательно, чтобы не перегружать API
    (async () => {
      for (const group of linked) {
        await checkGroupStatus(group);
      }
    })();
  }, [linked, initialCheckDone, checkGroupStatus]);

  const handleLink = async (group: MaxGroup) => {
    setLinking(String(group.max_chat_id));
    setError(null);
    try {
      const res = await fetch('/api/max/groups/add-to-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, max_chat_id: group.max_chat_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      setLinked(prev => [...prev, { ...group, link_status: 'active' }]);
      setAvailable(prev => prev.filter(g => g.max_chat_id !== group.max_chat_id));
      setSuccess(`Группа "${group.title}" привязана`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinking(null);
    }
  };

  const handleSync = async (group: MaxGroup) => {
    setSyncing(String(group.max_chat_id));
    setError(null);
    try {
      const res = await fetch('/api/max/groups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, max_chat_id: group.max_chat_id }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed');

      setSuccess(`Синхронизировано: ${data.synced} новых, ${data.skipped} пропущено из ${data.total}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(null);
    }
  };

  const statusBadge = (group: MaxGroup) => {
    const chatId = String(group.max_chat_id);
    const health = healthMap[chatId];

    if (!health) {
      // Пока не проверено — используем DB-статус
      switch (group.bot_status) {
        case 'connected':
          return <Badge variant="default" className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Подключен</Badge>;
        case 'inactive':
          return <Badge variant="secondary" className="bg-red-100 text-red-700"><Unplug className="w-3 h-3 mr-1" />Неактивен</Badge>;
        default:
          return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{group.bot_status}</Badge>;
      }
    }

    // Проверено — показываем актуальный статус
    if (!health.bot_in_group) {
      return <Badge variant="secondary" className="bg-red-100 text-red-700"><Unplug className="w-3 h-3 mr-1" />Бот удалён</Badge>;
    }
    if (health.bot_is_admin) {
      return <Badge variant="default" className="bg-green-100 text-green-700"><ShieldCheck className="w-3 h-3 mr-1" />Админ</Badge>;
    }
    return <Badge variant="default" className="bg-yellow-100 text-yellow-700"><ShieldAlert className="w-3 h-3 mr-1" />Участник (не админ)</Badge>;
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{success}
        </div>
      )}

      {/* Linked groups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Привязанные группы</CardTitle>
        </CardHeader>
        <CardContent>
          {linked.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Нет привязанных MAX групп. Добавьте бота{mainBotUsername ? ` @${mainBotUsername}` : ''} в группу MAX, затем привяжите её здесь.
            </p>
          ) : (
            <div className="space-y-3">
              {linked.map(group => {
                const chatId = String(group.max_chat_id);
                const health = healthMap[chatId];
                const isChecking = checking === chatId;
                const hasWarning = health && (!health.bot_in_group || !health.bot_is_admin);

                return (
                  <div key={group.max_chat_id} className="space-y-0">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <Link
                        href={`/p/${orgId}/max/groups/${group.max_chat_id}`}
                        className="flex items-center gap-3 min-w-0 flex-1 group"
                      >
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate group-hover:text-indigo-600 transition-colors">
                            {group.title || `Chat ${group.max_chat_id}`}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            {statusBadge(group)}
                            {group.member_count != null && (
                              <span>{group.member_count} участников</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mr-2" />
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost" size="sm"
                          disabled={isChecking}
                          onClick={() => checkGroupStatus(group)}
                          title="Проверить статус бота"
                        >
                          {isChecking ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={syncing === chatId}
                          onClick={() => handleSync(group)}
                        >
                          {syncing === chatId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><RefreshCw className="w-4 h-4 mr-1" />Синхр</>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Предупреждения */}
                    {health && !health.bot_in_group && (
                      <div className="mx-3 mt-1 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Бот удалён из группы.</strong> Добавьте бота{mainBotUsername ? ` @${mainBotUsername}` : ''} обратно в группу, чтобы восстановить работу анонсов и синхронизации.
                          {health.warning && <span className="block mt-0.5">{health.warning}</span>}
                        </div>
                      </div>
                    )}
                    {health && health.bot_in_group && !health.bot_is_admin && (
                      <div className="mx-3 mt-1 p-2 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800 flex items-start gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Бот не является администратором.</strong> Назначьте бота{mainBotUsername ? ` @${mainBotUsername}` : ''} администратором группы для полного функционала (��нонсы, получение списка участников).
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available (unlinked) groups */}
      {available.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Доступные группы</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500 text-sm mb-3">
              Группы, в которых бот{mainBotUsername ? ` @${mainBotUsername}` : ''} добавлен, но не привязан к организации.
            </p>
            <div className="space-y-3">
              {available.map(group => (
                <div key={group.max_chat_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{group.title || `Chat ${group.max_chat_id}`}</p>
                      {group.member_count != null && (
                        <p className="text-xs text-gray-500">{group.member_count} участников</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={linking === String(group.max_chat_id)}
                    onClick={() => handleLink(group)}
                  >
                    {linking === String(group.max_chat_id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <><Plus className="w-4 h-4 mr-1" />Привязать</>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Как подключить группу MAX</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2.5 text-sm text-gray-600">
            <li><strong>Найдите и запустите бота</strong> — в MAX найдите{mainBotUsername ? ` @${mainBotUsername}` : ' бота Orbo'} через поиск и нажмите «Начать».</li>
            <li><strong>Добавьте бота в группу</strong> — откройте группу → Настройки → Участники → Добавить → выберите бота.</li>
            <li><strong>Назначьте бота администратором</strong> — Участники → нажмите на бота → «Назначить администратором». Без этого бот не сможет читать участников и отправлять анонсы.</li>
            <li>Обновите эту страницу — группа появится в «Доступные группы» → нажмите «Привязать».</li>
            <li>Нажмите «Синхр» для импорта участников.</li>
          </ol>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <strong>Важно:</strong> если вы заменили бота — убедитесь, что токен нового бота указан в настройках сервера (<code className="bg-amber-100 px-1 rounded">MAX_MAIN_BOT_TOKEN</code>) и приложение перезапущено.
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Статус бота проверяется при открытии страницы (🛡). Если синхронизация показывает ошибку — проверьте, что бот является администратором.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
