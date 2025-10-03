import { createAdminServer } from '@/lib/server/supabaseServer';

const supabaseAdmin = createAdminServer();

export async function listScheduledConnections() {
  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .select('id, org_id, sync_mode, schedule_cron, status, connector:integration_connectors(code)')
    .eq('sync_mode', 'scheduled')
    .not('schedule_cron', 'is', null)
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  return data;
}

export async function updateConnectionLastSync(connectionId: string, status: string) {
  const { error } = await supabaseAdmin
    .from('integration_connections')
    .update({ last_sync_at: new Date().toISOString(), last_status: status })
    .eq('id', connectionId);

  if (error) {
    throw error;
  }
}

