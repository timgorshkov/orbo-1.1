import { createAdminServer } from '@/lib/server/supabaseServer';

const supabaseAdmin = createAdminServer();

export async function fetchIntegrationConnection(orgId: string, connectorCode: string) {
  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .select('id, status, sync_mode, schedule_cron, last_sync_at, last_status, credentials_encrypted, config, connector:integration_connectors(code)')
    .eq('org_id', orgId)
    .eq('connector.code', connectorCode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertIntegrationConnection(connection: {
  id?: string;
  orgId: string;
  connectorId: string;
  status: string;
  syncMode: string;
  scheduleCron?: string | null;
  credentialsEncrypted?: string | null;
  config?: Record<string, unknown> | null;
}) {
  const payload: Record<string, unknown> = {
    org_id: connection.orgId,
    connector_id: connection.connectorId,
    status: connection.status,
    sync_mode: connection.syncMode,
    schedule_cron: connection.scheduleCron ?? null,
    credentials_encrypted: connection.credentialsEncrypted ?? null,
    config: connection.config ?? null,
  };

  if (connection.id) {
    payload.id = connection.id;
  }

  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .upsert(payload, { onConflict: 'org_id,connector_id', ignoreDuplicates: false })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createIntegrationJob(job: {
  connectionId: string;
  jobType: string;
  status?: string;
  result?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
}) {
  const { data, error } = await supabaseAdmin
    .from('integration_jobs')
    .insert({
      connection_id: job.connectionId,
      job_type: job.jobType,
      status: job.status ?? 'pending',
      result: job.result ?? null,
      error: job.error ?? null
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateIntegrationJob(jobId: string, patch: Partial<{ status: string; result: Record<string, unknown> | null; error: Record<string, unknown> | null }>) {
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.result !== undefined) payload.result = patch.result;
  if (patch.error !== undefined) payload.error = patch.error;
  if (patch.status === 'success' || patch.status === 'error') {
    payload.finished_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('integration_jobs')
    .update(payload)
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createIntegrationJobLog(jobId: string, log: { level: string; message: string; context?: Record<string, unknown> }) {
  const { error } = await supabaseAdmin
    .from('integration_job_logs')
    .insert({
      job_id: jobId,
      level: log.level,
      message: log.message,
      context: log.context ?? null
    });

  if (error) {
    throw error;
  }
}

export async function listIntegrationJobs(connectionId: string, limit = 10) {
  const { data, error } = await supabaseAdmin
    .from('integration_jobs')
    .select('id, job_type, status, started_at, finished_at, result, error')
    .eq('connection_id', connectionId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listIntegrationJobLogs(jobIds: string[], limitPerJob = 20) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return [] as Array<{ id: string; job_id: string; level: string; message: string | null; context: Record<string, unknown> | null; created_at: string }>;
  }

  const limit = Math.max(limitPerJob * jobIds.length, limitPerJob);

  const { data, error } = await supabaseAdmin
    .from('integration_job_logs')
    .select('id, job_id, level, message, context, created_at')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

