'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface IntegrationActionsProps {
  orgId: string;
  connectorCode: string;
  connection: {
    id: string;
    status: string;
  } | null;
  jobs: Array<{
    id: string;
    job_type: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    result?: Record<string, unknown> | null;
    error?: Record<string, unknown> | null;
  }>;
  logs: Array<{
    id: string;
    job_id: string;
    level: string;
    message: string | null;
    context: Record<string, unknown> | null;
    created_at: string;
  }>;
}

type ActionState = {
  testing: boolean;
  syncing: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
};

export function IntegrationActions({ orgId, connectorCode, connection, jobs, logs }: IntegrationActionsProps) {
  const [state, setState] = useState<ActionState>({ testing: false, syncing: false, message: null });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleTest = async () => {
    if (!connection) {
      setState({ testing: false, syncing: false, message: { type: 'error', text: 'Интеграция не настроена' } });
      return;
    }

    setState(prev => ({ ...prev, testing: true, message: null }));
    try {
      const response = await fetch(`/api/integrations/${connectorCode}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || payload?.error || 'Тест не прошёл');
      }

      setState({ testing: false, syncing: false, message: { type: 'success', text: 'Подключение успешно' } });
    } catch (error: any) {
      setState({ testing: false, syncing: false, message: { type: 'error', text: error.message || 'Ошибка тестирования' } });
    }
  };

  const handleSync = async () => {
    if (!connection) {
      setState({ testing: false, syncing: false, message: { type: 'error', text: 'Интеграция не настроена' } });
      return;
    }

    setState(prev => ({ ...prev, syncing: true, message: null }));
    try {
      const response = await fetch(`/api/integrations/${connectorCode}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || payload?.error || 'Синхронизация не запущена');
      }

      setState({ testing: false, syncing: false, message: { type: 'success', text: 'Синхронизация запущена' } });
      startTransition(() => router.refresh());
    } catch (error: any) {
      setState({ testing: false, syncing: false, message: { type: 'error', text: error.message || 'Ошибка синхронизации' } });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Управление интеграцией</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={!connection || state.testing || isPending}>
            {state.testing ? 'Тестирование…' : 'Проверить подключение'}
          </Button>
          <Button onClick={handleSync} disabled={!connection || state.syncing || isPending}>
            {state.syncing ? 'Запуск…' : 'Запустить синхронизацию'}
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/app/${orgId}/members?q=source:${connectorCode}`}>Показать участников</Link>
          </Button>
        </div>

        {state.message && (
          <div className={state.message.type === 'success' ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
            {state.message.text}
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Последние задания</h3>
          {jobs.length > 0 ? (
            <div className="space-y-3">
              {jobs.map(job => (
                <div key={job.id} className="rounded border border-neutral-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Тип</span>
                    <span className="font-medium">{job.job_type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Статус</span>
                    <span className="font-medium">{job.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Запущен</span>
                    <span className="font-medium">{new Date(job.started_at).toLocaleString('ru')}</span>
                  </div>
                  {job.finished_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Завершён</span>
                      <span className="font-medium">{new Date(job.finished_at).toLocaleString('ru')}</span>
                    </div>
                  )}
                  {(() => {
                    const stats = job.result?.stats;
                    if (!stats || typeof stats !== 'object') return null;
                    const entries = Object.entries(stats).filter(
                      (entry): entry is [string, number] => typeof entry[1] === 'number'
                    );
                    if (entries.length === 0) return null;
                    return (
                      <div className="mt-2 text-neutral-600">
                        <div className="text-neutral-500">Статистика:</div>
                        <ul className="list-disc list-inside">
                          {entries.map(([key, value]) => (
                            <li key={key}>
                              <span className="text-neutral-500 mr-1">{key}:</span>
                              <span className="font-medium">{value}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                  {(() => {
                    const message = job.error?.message;
                    if (typeof message !== 'string' || !message) return null;
                    return <div className="mt-2 text-red-600">{message}</div>;
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">История запусков отсутствует.</p>
          )}
        </div>

        {logs.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-2">Журнал</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
              {logs.map(log => (
                <div key={log.id} className="rounded border border-neutral-200 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.level.toUpperCase()}</span>
                    <span className="text-neutral-500">
                      {new Date(log.created_at).toLocaleString('ru', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {(() => {
                    const message = log.message;
                    if (typeof message !== 'string' || !message) return null;
                    return <div className="mt-1 text-neutral-700 whitespace-pre-wrap">{message}</div>;
                  })()}
                  {(() => {
                    const context = log.context;
                    if (!context || typeof context !== 'object') return null;
                    const entries = Object.entries(context);
                    if (entries.length === 0) return null;
                    return (
                      <div className="mt-1 text-neutral-500">
                        <div>Контекст:</div>
                        <ul className="list-disc list-inside">
                          {entries.map(([key, value]) => (
                            <li key={key}>
                              <span className="font-medium mr-1">{key}:</span>
                              <span>{typeof value === 'string' ? value : JSON.stringify(value)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
