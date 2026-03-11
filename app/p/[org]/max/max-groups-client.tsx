'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, RefreshCw, Plus, Loader2, CheckCircle2, XCircle, Clock, Unplug, ChevronRight } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      if (!res.ok) throw new Error(data.error || 'Failed');

      setSuccess(`Синхронизировано: ${data.synced} новых, ${data.skipped} пропущено из ${data.total}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Подключен</Badge>;
      case 'inactive':
        return <Badge variant="secondary" className="bg-red-100 text-red-700"><Unplug className="w-3 h-3 mr-1" />Неактивен</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{status}</Badge>;
    }
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
              {linked.map(group => (
                <div key={group.max_chat_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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
                        {statusBadge(group.bot_status)}
                        {group.member_count != null && (
                          <span>{group.member_count} участников</span>
                        )}
                        {group.last_sync_at && (
                          <span>Синхр: {new Date(group.last_sync_at).toLocaleDateString('ru-RU')}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mr-2" />
                  </Link>
                  <Button
                    variant="outline" size="sm"
                    disabled={syncing === String(group.max_chat_id)}
                    onClick={() => handleSync(group)}
                  >
                    {syncing === String(group.max_chat_id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-1" />Синхр</>
                    )}
                  </Button>
                </div>
              ))}
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
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Откройте MAX и перейдите в нужную группу</li>
            <li>Добавьте бота{mainBotUsername ? ` @${mainBotUsername}` : ' Orbo'} в группу как участника</li>
            <li>Бот автоматически появится в списке доступных групп выше</li>
            <li>Нажмите "Привязать" для подключения группы к организации</li>
            <li>Нажмите "Синхронизировать" для импорта участников</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
