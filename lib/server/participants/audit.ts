import { createAdminServer } from '@/lib/server/supabaseServer';

const supabaseAdmin = createAdminServer();

export type ParticipantAuditInput = {
  orgId: string;
  participantId: string;
  actorId?: string | null;
  actorType?: 'system' | 'user' | 'integration';
  source: string;
  action: string;
  fieldChanges?: Record<string, unknown> | null;
  message?: string | null;
  integrationJobId?: string | null;
};

export async function logParticipantAudit(entry: ParticipantAuditInput) {
  const payload = {
    org_id: entry.orgId,
    participant_id: entry.participantId,
    actor_id: entry.actorId ?? null,
    actor_type: entry.actorType ?? 'system',
    source: entry.source,
    action: entry.action,
    field_changes: entry.fieldChanges ?? null,
    message: entry.message ?? null,
    integration_job_id: entry.integrationJobId ?? null
  };

  const { error } = await supabaseAdmin
    .from('participant_audit_log')
    .insert(payload);

  if (error) {
    console.error('Failed to log participant audit entry:', error);
  }
}

