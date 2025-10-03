import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { encryptCredentials, decryptCredentials } from '@/lib/services/integrations/credentials';
import { upsertIntegrationConnection, fetchIntegrationConnection } from '@/lib/services/integrations/connectionStore';
import { revalidatePath } from 'next/cache';

const supabaseAdmin = createAdminServer();

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { connector: string } }) {
  try {
    const body = await request.json();
    const orgId = String(body.orgId ?? '').trim();
    const baseUrl = String(body.baseUrl ?? '').trim();
    const apiKeyRaw = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const syncMode = (body.syncMode ?? 'manual') as string;
    const scheduleCron = typeof body.scheduleCron === 'string' && body.scheduleCron.trim() ? body.scheduleCron.trim() : null;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    if (!baseUrl) {
      return NextResponse.json({ error: 'Base URL is required' }, { status: 400 });
    }

    const { data: connector, error: connectorError } = await supabaseAdmin
      .from('integration_connectors')
      .select('id, code, name')
      .eq('code', params.connector)
      .maybeSingle();

    if (connectorError) {
      throw connectorError;
    }

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const existing = await fetchIntegrationConnection(orgId, params.connector);

    let existingCredentials: Record<string, unknown> = {};
    if (existing?.credentials_encrypted) {
      existingCredentials = decryptCredentials(existing.credentials_encrypted) ?? {};
    }

    const finalApiKey = apiKeyRaw || (existingCredentials?.apiKey as string | undefined) || '';

    if (!finalApiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const credentialsEncrypted = encryptCredentials({
      apiKey: finalApiKey,
      baseUrl
    });

    const connectionRecord = await upsertIntegrationConnection({
      id: existing?.id,
      orgId,
      connectorId: connector.id,
      status: 'active',
      syncMode,
      scheduleCron,
      credentialsEncrypted,
      config: { baseUrl }
    });

    revalidatePath(`/app/${orgId}/integrations`);
    revalidatePath(`/app/${orgId}/integrations/${params.connector}`);

    return NextResponse.json({ success: true, connectionId: connectionRecord?.id ?? existing?.id ?? null });
  } catch (error: any) {
    console.error('Integration connection error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

