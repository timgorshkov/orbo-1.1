import AppShell from '@/components/app-shell';
import { requireOrgAccess } from '@/lib/orgGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import { createAdminServer } from '@/lib/server/supabaseServer';
import Link from 'next/link';
import { listIntegrationJobs, listIntegrationJobLogs } from '@/lib/services/integrations/connectionStore';
import { IntegrationSettingsForm } from './settings-form';
import { IntegrationActions } from './integration-actions';

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

  let logs: Awaited<ReturnType<typeof listIntegrationJobLogs>> = [];

  if (connection?.id) {
    jobs = await listIntegrationJobs(connection.id, 5);
    const jobIds = jobs.map(job => job.id);
    if (jobIds.length > 0) {
      logs = await listIntegrationJobLogs(jobIds, 10);
    }
  }

  return { connector, connection, jobs, logs };
}

export default async function IntegrationDetailsPage({ params }: { params: { org: string; connector: string } }) {
  const { connector, connection, jobs, logs } = await loadIntegration(params.org, params.connector);

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
          </CardContent>
        </Card>

        <IntegrationSettingsForm
          orgId={params.org}
          connectorCode={params.connector}
          config={connection?.config ?? null}
        />

        <IntegrationActions
          orgId={params.org}
          connectorCode={params.connector}
          connection={connection}
          jobs={jobs}
          logs={logs}
        />
      </div>
    </AppShell>
  );
}

