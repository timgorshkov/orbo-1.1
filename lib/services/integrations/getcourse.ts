import { Buffer } from 'node:buffer';
import { IntegrationConnector, ConnectorTestResult, SyncJobSummary } from './connector';
import { decryptCredentials } from './credentials';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { updateConnectionLastSync } from './scheduler';
import { updateIntegrationJob, createIntegrationJobLog } from './connectionStore';
// REMOVED: logParticipantAudit - audit logging removed in migration 072

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

type FetchUsersResult = {
  users: GetCourseUser[];
  hasMore: boolean;
  totalCount: number | null;
  pageSize: number | null;
  pageInfo: Record<string, unknown>;
  debug: {
    endpoint: string;
    raw: Record<string, unknown>;
    payload: Record<string, unknown>;
  };
};

async function fetchUsers(credentials: GetCourseCredentials, page = 1): Promise<FetchUsersResult> {
  const base = credentials.baseUrl.replace(/\/+$/, '');
  const url = new URL('/pl/api/users', base);

  const paramsPayload = {
    selection: {
      status: 'any',
      order: 'id',
      direction: 'asc',
      page,
      per_page: 100
    }
  };

  const body = new URLSearchParams({
    key: credentials.apiKey,
    action: 'list',
    params: Buffer.from(JSON.stringify(paramsPayload)).toString('base64')
  });

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GetCourse API error (${response.status}): ${text}`);
  }

  const data = await response.json();

  if (data?.success === false) {
    const message = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : 'Unknown API error';
    throw new Error(`GetCourse API error: ${message}`);
  }

  const users = extractUsers(data);
  const pageInfo = extractPagination(data);
  const { totalCount, pageSize, hasMore } = evaluatePagination(pageInfo, users.length, page);

  return {
    users,
    hasMore,
    totalCount,
    pageSize,
    pageInfo,
    debug: {
      endpoint: '/pl/api/users',
      raw: sanitizePayload(data),
      payload: paramsPayload
    }
  };
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const MAX_STRING_LENGTH = 500;

  const trimString = (value: string) => (value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value);

  const deepSanitize = (value: any): any => {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return trimString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 5).map(deepSanitize);
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).slice(0, 20).map(([key, val]) => [key, deepSanitize(val)] as const);
      return Object.fromEntries(entries);
    }
    return String(value);
  };

  return deepSanitize(payload) as Record<string, unknown>;
}

function extractUsers(payload: any): GetCourseUser[] {
  if (!payload) return [];

  if (Array.isArray(payload.users)) return payload.users as GetCourseUser[];
  if (Array.isArray(payload.data)) return payload.data as GetCourseUser[];
  if (Array.isArray(payload.result)) return payload.result as GetCourseUser[];
  if (Array.isArray(payload.result?.users)) return payload.result.users as GetCourseUser[];
  if (Array.isArray(payload.data?.users)) return payload.data.users as GetCourseUser[];

  return [];
}

function extractPagination(payload: any): Record<string, unknown> {
  if (!payload) return {};

  if (payload.info && typeof payload.info === 'object') return payload.info as Record<string, unknown>;
  if (payload.meta?.pagination && typeof payload.meta.pagination === 'object') return payload.meta.pagination as Record<string, unknown>;
  if (payload.pagination && typeof payload.pagination === 'object') return payload.pagination as Record<string, unknown>;

  return {};
}

function evaluatePagination(
  pageInfo: Record<string, unknown>,
  receivedCount: number,
  currentPage: number
): { totalCount: number | null; pageSize: number | null; hasMore: boolean } {
  const total = normalizeNumber(pageInfo.total ?? pageInfo.total_count ?? pageInfo.totalCount ?? pageInfo.count ?? null);
  const perPage = normalizeNumber(pageInfo.per_page ?? pageInfo.perPage ?? pageInfo.per_page_count ?? pageInfo.limit ?? null);
  const totalPages = normalizeNumber(pageInfo.total_pages ?? pageInfo.totalPages ?? pageInfo.pages ?? null);
  const hasMoreExplicit = Boolean(pageInfo.has_more ?? pageInfo.hasMore ?? false);

  if (typeof totalPages === 'number' && totalPages > 0) {
    return { totalCount: total, pageSize: perPage, hasMore: currentPage < totalPages };
  }

  if (typeof total === 'number' && typeof perPage === 'number' && perPage > 0) {
    return { totalCount: total, pageSize: perPage, hasMore: currentPage * perPage < total };
  }

  if (hasMoreExplicit) {
    return { totalCount: total, pageSize: perPage ?? receivedCount, hasMore: true };
  }

  if (typeof perPage === 'number' && perPage > 0) {
    return { totalCount: total, pageSize: perPage, hasMore: receivedCount >= perPage };
  }

  return { totalCount: total, pageSize: receivedCount, hasMore: receivedCount > 0 && receivedCount % 100 === 0 };
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
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
      const { totalCount, debug } = await fetchUsers(credentials, 1);
      const inspected = typeof totalCount === 'number' ? ` Найдено записей: ${totalCount}.` : '';
      return {
        success: true,
        message: `GetCourse API доступна.${inspected}`.trim(),
        details: { endpoint: debug.endpoint, sample: debug.raw, payload: debug.payload }
      };
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
        const { users, hasMore: next, totalCount, pageSize, pageInfo, debug } = await fetchUsers(credentials, page);
        if (page === 1) {
          await createIntegrationJobLog(options.jobId, {
            level: 'info',
            message:
              `Получена страница ${page} из GetCourse` +
              (typeof totalCount === 'number' ? ` (всего пользователей: ${totalCount})` : ''),
            context: { page, totalCount, pageSize, pageInfo, endpoint: debug.endpoint, payload: debug.payload }
          });
        }
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

                // REMOVED: Audit logging (migration 072)
                console.log(`[GetCourse] Updated participant ${existing.id}`);

                stats.updated += 1;
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

              // REMOVED: Audit logging (migration 072)
              if (participantId) {
                console.log(`[GetCourse] Created participant ${participantId}`);
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

              // REMOVED: Audit logging (migration 072)
              console.log(`[GetCourse] Upserted external ID for participant ${participantId}`);
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

