import { IntegrationConnector, ConnectorTestResult, SyncJobSummary } from './connector';
import { decryptCredentials } from './credentials';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { updateConnectionLastSync } from './scheduler';
import { updateIntegrationJob, createIntegrationJobLog } from './connectionStore';
import { logParticipantAudit } from '@/lib/server/participants/audit';

const supabaseAdmin = createAdminServer();

type GetCourseCredentials = {
  baseUrl: string; // https://example.getcourse.ru
  apiKey: string;
};

type GetCourseConfig = {
  importGroupIds?: number[];
};

type GetCourseUser = {
  id: number;
  email?: string;
  phone?: string;
  skype?: string;
  telegram?: string;
  firstName?: string;
  lastName?: string;
  fields?: Record<string, unknown>;
};

async function fetchUsers(credentials: GetCourseCredentials, page = 1): Promise<{ users: GetCourseUser[]; hasMore: boolean }> {
  const url = new URL('/public/api/users', credentials.baseUrl);
  url.searchParams.set('key', credentials.apiKey);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', '100');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GetCourse API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  const users = Array.isArray(data?.users) ? data.users : [];
  const totalPages = data?.meta?.pagination?.total ?? 1;
  const hasMore = page < totalPages;

  return { users, hasMore };
}

function normalizePhone(phone?: string | null): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D+/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('7') && digits.length === 11) {
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  return `+${digits}`;
}

export class GetCourseConnector implements IntegrationConnector {
  readonly code = 'getcourse';
  readonly name = 'GetCourse';
  readonly description = 'Импортирует участников из платформы GetCourse';

  async testConnection(options: { orgId: string; credentials: Record<string, unknown>; config?: Record<string, unknown> }): Promise<ConnectorTestResult> {
    const credentials = options.credentials as GetCourseCredentials;

    try {
      await fetchUsers(credentials, 1);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async runSync(options: {
    orgId: string;
    connectionId: string;
    credentials: Record<string, unknown>;
    config?: Record<string, unknown>;
    mode: 'manual' | 'scheduled';
    jobId: string;
  }): Promise<SyncJobSummary> {
    const credentials = options.credentials as GetCourseCredentials;
    const stats: Record<string, number> = {
      processed: 0,
      matched: 0,
      created: 0,
      updated: 0,
      errors: 0
    };

    let hasMore = true;
    let page = 1;
    const errors: Array<{ code: string; message: string; context?: Record<string, unknown> }> = [];

    while (hasMore) {
      try {
        const { users, hasMore: next } = await fetchUsers(credentials, page);
        hasMore = next;
        page += 1;

        for (const user of users) {
          stats.processed += 1;
          try {
            const email = (user.email ?? '').toLowerCase().trim() || null;
            const phone = normalizePhone(user.phone ?? null);
            const telegram = user.telegram?.trim() || null;

            let participantQuery = supabaseAdmin
              .from('participants')
              .select('id, email, phone, username, full_name, first_name, last_name, source, status')
              .eq('org_id', options.orgId);

            const matchFilters = [
              email ? `email.eq.${email}` : undefined,
              phone ? `phone.eq.${phone}` : undefined,
              telegram ? `username.eq.${telegram.replace(/^@/, '')}` : undefined
            ].filter(Boolean);

            if (matchFilters.length > 0) {
              participantQuery = participantQuery.or(matchFilters.join(','));
            }

            const { data: participants } = await participantQuery;

            let participantId: string | null = null;

            const fullNameCandidate = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();

            if (participants && participants.length > 0) {
              const existing = participants[0];
              participantId = existing.id;
              stats.matched += 1;

              const patch: Record<string, any> = {};
              if (!existing.first_name && user.firstName) {
                patch.first_name = user.firstName;
              }
              if (!existing.last_name && user.lastName) {
                patch.last_name = user.lastName;
              }
              if ((!existing.full_name || existing.full_name === existing.username) && fullNameCandidate) {
                patch.full_name = fullNameCandidate;
              }
              if (!existing.email && email) {
                patch.email = email;
              }
              if (!existing.phone && phone) {
                patch.phone = phone;
              }
              if (!existing.username && telegram) {
                patch.username = telegram.replace(/^@/, '');
              }
              if (!existing.source || existing.source === 'unknown') {
                patch.source = 'getcourse';
              }
              if (!existing.status || existing.status === 'inactive') {
                patch.status = 'active';
              }

              if (Object.keys(patch).length > 0) {
                patch.updated_at = new Date().toISOString();
                await supabaseAdmin
                  .from('participants')
                  .update(patch)
                  .eq('id', existing.id);

                await logParticipantAudit({
                  orgId: options.orgId,
                  participantId: existing.id,
                  actorType: 'integration',
                  source: 'getcourse',
                  action: 'update',
                  fieldChanges: patch,
                  integrationJobId: options.jobId
                });
              }
            } else {
              const nowIso = new Date().toISOString();
              const { data: inserted, error: insertError } = await supabaseAdmin
                .from('participants')
                .insert({
                  org_id: options.orgId,
                  first_name: user.firstName ?? null,
                  last_name: user.lastName ?? null,
                  full_name: fullNameCandidate || user.email || user.phone || 'Участник GetCourse',
                  email,
                  phone,
                  username: telegram ? telegram.replace(/^@/, '') : null,
                  source: 'getcourse',
                  status: 'active',
                  created_at: nowIso,
                  updated_at: nowIso
                })
                .select('id')
                .single();

              if (insertError) {
                throw insertError;
              }

              participantId = inserted?.id ?? null;
              stats.created += 1;

              if (participantId) {
                await logParticipantAudit({
                  orgId: options.orgId,
                  participantId,
                  actorType: 'integration',
                  source: 'getcourse',
                  action: 'create',
                  fieldChanges: {
                    first_name: user.firstName ?? null,
                    last_name: user.lastName ?? null,
                    full_name: fullNameCandidate || user.email || user.phone || 'Участник GetCourse',
                    email,
                    phone,
                    username: telegram ? telegram.replace(/^@/, '') : null,
                    source: 'getcourse',
                    status: 'active'
                  },
                  integrationJobId: options.jobId
                });
              }
            }

            if (participantId) {
              await supabaseAdmin
                .from('participant_external_ids')
                .upsert(
                  {
                    participant_id: participantId,
                    org_id: options.orgId,
                    system_code: 'getcourse',
                    external_id: String(user.id),
                    url: `${credentials.baseUrl.replace(/\/$/, '')}/pl/users/${user.id}`,
                    data: {
                      email,
                      phone,
                      telegram,
                      fields: user.fields ?? null
                    }
                  },
                  { onConflict: 'participant_id,system_code', ignoreDuplicates: false }
                );

              stats.updated += 1;

              await logParticipantAudit({
                orgId: options.orgId,
                participantId,
                actorType: 'integration',
                source: 'getcourse',
                action: 'external_id_upsert',
                fieldChanges: {
                  system_code: 'getcourse',
                  external_id: String(user.id)
                },
                integrationJobId: options.jobId
              });
            }
          } catch (userError: any) {
            stats.errors += 1;
            errors.push({
              code: 'user_import_failed',
              message: userError.message,
              context: { userId: user.id }
            });

            await createIntegrationJobLog(options.jobId, {
              level: 'error',
              message: `Ошибка обработки пользователя ${user.id}: ${userError.message}`,
              context: { userId: user.id }
            });
          }
        }
      } catch (error: any) {
        await updateIntegrationJob(options.jobId, {
          status: 'error',
          error: { message: error.message }
        });

        await createIntegrationJobLog(options.jobId, {
          level: 'error',
          message: `Ошибка при загрузке пользователей: ${error.message}`,
          context: { page }
        });

        return {
          success: false,
          stats,
          message: error.message,
          errors
        };
      }
    }

    await updateIntegrationJob(options.jobId, { status: 'success', result: { stats } });
    await updateConnectionLastSync(options.connectionId, 'success');

    return {
      success: true,
      stats,
      message: `Импортировано пользователей: ${stats.processed}`,
      errors
    };
  }
}

