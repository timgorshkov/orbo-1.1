import AppShell from '@/components/app-shell';
import { requireOrgAccess } from '@/lib/orgGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { createClientServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

async function loadData(orgId: string) {
  const { supabase } = await requireOrgAccess(orgId);

  const [{ data: connections }, { data: connectors }] = await Promise.all([
    supabase
      .from('integration_connections')
      .select('id, status, sync_mode, schedule_cron, last_sync_at, last_status, connector:integration_connectors(code, name, description)')
      .eq('org_id', orgId),
    createClientServer()
      .from('integration_connectors')
      .select('id, code, name, description, category')
  ]);

  return {
    connections: connections ?? [],
    connectors: connectors ?? []
  };
}

export default async function IntegrationsPage({ params }: { params: { org: string } }) {
  const { connections, connectors } = await loadData(params.org);

  type ConnectorRow = { id: string; code: string; name: string; description?: string | null; category?: string | null };

  const connectorList: ConnectorRow[] = Array.isArray(connectors)
    ? (connectors as ConnectorRow[])
    : [];

  const connectorsByCode = new Map<string, ConnectorRow>(
    connectorList.map(connector => [connector.code, connector] as [string, ConnectorRow])
  );

  const availableConnectors: ConnectorRow[] = connectorList.filter(connector => {
    return !connections?.some(connection => {
      const related = connection.connector;
      const relatedEntry = Array.isArray(related) ? related[0] : related;
      return relatedEntry?.code === connector.code;
    });
  });

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/integrations`}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Интеграции</h1>
        <p className="text-sm text-neutral-500">Управляйте синхронизацией с внешними системами</p>
      </div>

      <div className="grid gap-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Подключенные интеграции</h2>
          {connections && connections.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {connections.map(connection => {
                const related = Array.isArray(connection.connector)
                  ? connection.connector[0]
                  : connection.connector || null;
                const connectorCode = related?.code ?? '';
                const connector = connectorsByCode.get(connectorCode) ?? null;
                return (
                  <Card key={connection.id}>
                    <CardHeader>
                      <CardTitle>{connector?.name ?? (connectorCode || 'Интеграция')}</CardTitle>
                      <p className="text-sm text-neutral-500">{connector?.description}</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-500">Статус</span>
                        <span className="font-medium">{connection.status}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-500">Режим</span>
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
                      <Link
                        href={`/app/${params.org}/integrations/${connectorCode}`}
                        className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                      >
                        Управлять
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-neutral-500">
                Интеграции ещё не подключены. Добавьте первую ниже.
              </CardContent>
            </Card>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Доступные интеграции</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {availableConnectors.map(connector => (
              <Card key={connector.code}>
                <CardHeader>
                  <CardTitle>{connector.name}</CardTitle>
                  <p className="text-sm text-neutral-500">{connector.description}</p>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/app/${params.org}/integrations/${connector.code}`}
                    className="inline-flex w-full items-center justify-center rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                  >
                    Подключить
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

