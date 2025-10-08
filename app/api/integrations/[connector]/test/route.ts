import { NextRequest, NextResponse } from 'next/server';
import { connectorRegistry } from '@/lib/services/integrations/registry';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { decryptCredentials } from '@/lib/services/integrations/credentials';

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
      .select('id, credentials_encrypted, config, connector:integration_connectors(*)')
      .eq('org_id', orgId)
      .eq('connector.code', params.connector)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!connection) {
      return NextResponse.json({ error: 'Integration connection not found' }, { status: 404 });
    }

    const credentials = decryptCredentials(connection.credentials_encrypted ?? null);
    const result = await connector.testConnection({
      orgId,
      credentials,
      config: (connection.config ?? {}) as Record<string, unknown>
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Integration test error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

