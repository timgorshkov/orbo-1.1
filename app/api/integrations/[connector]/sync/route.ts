import { NextRequest, NextResponse } from 'next/server';
import { connectorRegistry } from '@/lib/services/integrations/registry';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { decryptCredentials } from '@/lib/services/integrations/credentials';
import { createIntegrationJob, updateIntegrationJob, createIntegrationJobLog } from '@/lib/services/integrations/connectionStore';

const supabaseAdmin = createAdminServer();

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { connector: string } }) {
  try {
    const body = await request.json();
    const orgId = body.orgId;
    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const connector = connectorRegistry.get(params.connector);
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const { data: connection, error } = await supabaseAdmin
      .from('integration_connections')
      .select('id, credentials_encrypted, config, status, connector:integration_connectors(code)')
      .eq('org_id', orgId)
      .eq('connector:integration_connectors.code', params.connector)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!connection) {
      return NextResponse.json({ error: 'Integration connection not found' }, { status: 404 });
    }

    if (connection.status !== 'active') {
      return NextResponse.json({ error: 'Integration connection is not active' }, { status: 400 });
    }

    const job = await createIntegrationJob({
      connectionId: connection.id,
      jobType: 'manual_sync',
      status: 'running'
    });

    try {
      const credentials = decryptCredentials(connection.credentials_encrypted ?? null);
      const result = await connector.runSync({
        orgId,
        connectionId: connection.id,
        credentials,
        config: (connection.config ?? {}) as Record<string, unknown>,
        mode: 'manual',
        jobId: job.id
      });

      return NextResponse.json(result);
    } catch (syncError: any) {
      await updateIntegrationJob(job.id, { status: 'error', error: { message: syncError.message } });
      await createIntegrationJobLog(job.id, {
        level: 'error',
        message: `Ошибка синхронизации: ${syncError.message}`
      });
      throw syncError;
    }
  } catch (error: any) {
    console.error('Integration sync error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

