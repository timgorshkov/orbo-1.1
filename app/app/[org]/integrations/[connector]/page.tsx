import AppShell from '@/components/app-shell';
import { requireOrgAccess } from '@/lib/orgGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import { createAdminServer } from '@/lib/server/supabaseServer';
import Link from 'next/link';
import { listIntegrationJobs } from '@/lib/services/integrations/connectionStore';
import { IntegrationSettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

async function loadIntegration(orgId: string, connectorCode: string) {
  const { supabase } = await requireOrgAccess(orgId);
  const admin = createAdminServer();

  const { data: connector } = await admin
    .from('integration_connectors')
    .select('id, code, name, description, category')
    .eq('code', connectorCode)
    .maybeSingle();

  if (!connector) {
    return { connector: null, connection: null, jobs: [] as Awaited<ReturnType<typeof listIntegrationJobs>> };
  }

  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id, status, sync_mode, schedule_cron, last_sync_at, last_status, config')
    .eq('org_id', orgId)
    .eq('connector_id', connector.id)
    .maybeSingle();

  let jobs: Awaited<ReturnType<typeof listIntegrationJobs>> = [];

  if (connection?.id) {
    jobs = await listIntegrationJobs(connection.id, 5);
  }

  return { connector, connection, jobs };
}

export default async function IntegrationDetailsPage({ params }: { params: { org: string; connector: string } }) {
  const { connector, connection, jobs } = await loadIntegration(params.org, params.connector);

  if (!connector) {
    return notFound();
  }

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/integrations`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{connector.name}</h1>
          <p className="text-sm text-neutral-500 mt-1">{connector.description}</p>
        </div>
        <Link href={`/app/${params.org}/integrations`} className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Назад к интеграциям
        </Link>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Состояние подключения</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {connection ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Статус</span>
                  <span className="font-medium">{connection.status}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Режим синхронизации</span>
                  <span className="font-medium">{connection.sync_mode === 'scheduled' ? 'Периодический' : 'Разовый'}</span>
                </div>
                {connection.schedule_cron && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Расписание</span>
                    <span className="font-medium">{connection.schedule_cron}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Последний запуск</span>
                  <span className="font-medium">
                    {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString('ru') : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Последний статус</span>
                  <span className="font-medium">{connection.last_status ?? '—'}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500">Интеграция пока не настроена.</p>
            )}

            <div className="flex items-center gap-2">
              <Button variant="outline" disabled>
                Тестировать подключение
              </Button>
              <Button disabled>
                Запустить синхронизацию
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Настройки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <IntegrationSettingsForm
              orgId={params.org}
              connectorCode={params.connector}
              config={connection?.config ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Журнал операций</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length > 0 ? (
              <div className="space-y-3">
                {jobs.map(job => (
                  <div key={job.id} className="rounded border border-neutral-200 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-500">Тип</span>
                      <span className="font-medium">{job.job_type}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-500">Статус</span>
                      <span className="font-medium">{job.status}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-500">Запущен</span>
                      <span className="font-medium">{new Date(job.started_at).toLocaleString('ru')}</span>
                    </div>
                    {job.finished_at && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-500">Завершен</span>
                        <span className="font-medium">{new Date(job.finished_at).toLocaleString('ru')}</span>
                      </div>
                    )}
                    {job.result?.stats && (
                      <div className="mt-2 text-sm">
                        <div className="text-neutral-500">Статистика:</div>
                        <ul className="list-disc list-inside text-neutral-600">
                          {Object.entries(job.result.stats as Record<string, number>).map(([key, value]) => (
                            <li key={key}>
                              <span className="text-neutral-500 mr-1">{key}:</span>
                              <span className="font-medium">{value}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {job.error && (
                      <div className="mt-2 text-sm text-red-600">
                        {job.error.message ?? 'Ошибка синхронизации'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">История запусков отсутствует.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

