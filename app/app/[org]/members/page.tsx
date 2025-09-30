import { requireOrgAccess } from '@/lib/orgGuard';
import AppShell from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups';

export const dynamic = 'force-dynamic';

type Participant = {
  id: string;
  full_name: string | null;
  username: string | null;
  tg_user_id: number | null;
  identity_id?: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_activity_at: string | null;
  activity_score: number | null;
  risk_score: number | null;
  group_count?: number;
};

type RawParticipant = Participant & {
  merged_into?: string | null;
};

type IdentityRecord = {
  id: string | null;
  tg_user_id: number | null;
  username: string | null;
  full_name: string | null;
  last_activity_at?: string | null;
  activity_score?: number | null;
  risk_score?: number | null;
};

type CrossOrgCandidate = {
  id: string | null;
  tg_user_id: number | null;
  username: string | null;
  full_name: string | null;
  last_activity_at: string | null;
  activity_score: number | null;
  risk_score: number | null;
};

type ActivityAggregateRow = {
  identity_id: string | null;
  tg_user_id: number | null;
  event_count: number | null;
  last_activity: string | null;
};

type LegacyAggregateRow = {
  participant_id: string;
  event_count: number | null;
  last_activity: string | null;
};

function pickLatestTimestamp(current: string | null, incoming: string | null): string | null {
  if (!current) {
    return incoming ?? null;
  }

  if (!incoming) {
    return current;
  }

  const currentTs = new Date(current).getTime();
  const incomingTs = new Date(incoming).getTime();

  if (Number.isNaN(currentTs)) {
    return Number.isNaN(incomingTs) ? null : incoming;
  }

  if (Number.isNaN(incomingTs)) {
    return current;
  }

  return incomingTs >= currentTs ? incoming : current;
}

function calculateRiskScore(lastActivity: string | null | undefined, fallback?: number | null): number {
  if (!lastActivity) {
    return typeof fallback === 'number' ? fallback : 90;
  }

  const lastTs = new Date(lastActivity).getTime();

  if (Number.isNaN(lastTs)) {
    return typeof fallback === 'number' ? fallback : 90;
  }

  const nowTs = Date.now();
  const diffDays = Math.max(0, Math.floor((nowTs - lastTs) / (1000 * 60 * 60 * 24)));

  if (diffDays <= 3) {
    return 5;
  }

  if (diffDays <= 7) {
    return 15;
  }

  if (diffDays <= 14) {
    return 35;
  }

  if (diffDays <= 30) {
    return 60;
  }

  if (diffDays <= 60) {
    return 80;
  }

  return 95;
}

function normalizeParticipants(rows: RawParticipant[]): Participant[] {
  const identityMap = new Map<string, RawParticipant>();
  const tgMap = new Map<number, RawParticipant>();
  const anonymous: RawParticipant[] = [];

  rows.forEach(row => {
    if (row.merged_into) {
      return;
    }

    if (row.identity_id) {
      const key = row.identity_id;
      const existing = identityMap.get(key);
      if (!existing) {
        identityMap.set(key, row);
      } else {
        const existingTs = existing.last_activity_at ? new Date(existing.last_activity_at).getTime() : 0;
        const candidateTs = row.last_activity_at ? new Date(row.last_activity_at).getTime() : 0;
        if (candidateTs > existingTs) {
          identityMap.set(key, row);
        }
      }
      return;
    }

    if (row.tg_user_id) {
      const key = row.tg_user_id;
      const existing = tgMap.get(key);
      if (!existing) {
        tgMap.set(key, row);
      } else {
        const existingTs = existing.last_activity_at ? new Date(existing.last_activity_at).getTime() : 0;
        const candidateTs = row.last_activity_at ? new Date(row.last_activity_at).getTime() : 0;
        if (candidateTs > existingTs) {
          tgMap.set(key, row);
        }
      }
      return;
    }

    anonymous.push(row);
  });

  return [
    ...Array.from(identityMap.values()),
    ...Array.from(tgMap.values()).filter(participant => !participant.identity_id),
    ...anonymous
  ];
}

async function ensureParticipantsFromGlobalActivity(
  supabase: any,
  orgId: string,
  chatIds: number[],
  reaggregateOnly = false
) {
  if (!chatIds || chatIds.length === 0) {
    return;
  }

  try {
    const { data: identityEvents, error: identityEventsError } = await supabase
      .from('telegram_activity_events')
      .select('identity_id, tg_user_id, created_at, event_type')
      .in('tg_chat_id', chatIds)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (identityEventsError) {
      const errorCode = (identityEventsError as any)?.code;
      if (errorCode && errorCode !== '42P01') {
        console.error('Error loading identity events for participants ensure:', identityEventsError);
      }
      return;
    }

    if (!identityEvents || identityEvents.length === 0) {
      return;
    }

    const identityActivity = new Map<string, { last_activity: string | null; event_count: number }>();
    const userActivity = new Map<number, { last_activity: string | null; event_count: number }>();

    identityEvents.forEach((event: any) => {
      const identityId = event?.identity_id as string | null;
      const tgUserId = event?.tg_user_id as number | null;
      const createdAt = event?.created_at as string | null;

      if (!createdAt) {
        return;
      }

      if (identityId) {
        const existing = identityActivity.get(identityId) ?? { last_activity: null, event_count: 0 };
        identityActivity.set(identityId, {
          last_activity: pickLatestTimestamp(existing.last_activity, createdAt),
          event_count: existing.event_count + 1
        });
      } else if (tgUserId != null) {
        const existing = userActivity.get(tgUserId) ?? { last_activity: null, event_count: 0 };
        userActivity.set(tgUserId, {
          last_activity: pickLatestTimestamp(existing.last_activity, createdAt),
          event_count: existing.event_count + 1
        });
      }
    });

    const candidateUserIds = Array.from(userActivity.keys());

    if (candidateUserIds.length > 0) {
      const { data: identitiesByUser, error: identitiesByUserError } = await supabase
        .from('telegram_identities')
        .select('id, tg_user_id')
        .in('tg_user_id', candidateUserIds);

      if (identitiesByUserError) {
        console.error('Error resolving identities by tg_user_id:', identitiesByUserError);
      } else if (identitiesByUser) {
        identitiesByUser.forEach((record: any) => {
          const identityId = record?.id as string | null;
          const tgUserId = record?.tg_user_id as number | null;
          if (!identityId || tgUserId == null) {
            return;
          }

          const fallbackActivity = userActivity.get(tgUserId);
          const existing = identityActivity.get(identityId) ?? { last_activity: null, event_count: 0 };
          identityActivity.set(identityId, {
            last_activity: pickLatestTimestamp(existing.last_activity, fallbackActivity?.last_activity ?? null),
            event_count: existing.event_count + (fallbackActivity?.event_count ?? 0)
          });
        });
      }
    }

    const candidateIdentityIds = Array.from(identityActivity.keys());
    if (candidateIdentityIds.length === 0) {
      return;
    }

    const { data: existingParticipants, error: existingError } = await supabase
      .from('participants')
      .select('identity_id, merged_into')
      .eq('org_id', orgId)
      .in('identity_id', candidateIdentityIds);

    if (existingError) {
      const errorCode = (existingError as any)?.code;
      if (errorCode && errorCode !== '42P01') {
        console.error('Error checking participants by identity:', existingError);
      }
      return;
    }

    const existingIdentitySet = new Set(
      (existingParticipants || [])
        .filter((row: any) => !row?.merged_into)
        .map((row: any) => row.identity_id as string | null)
        .filter((identityId: string | null): identityId is string => Boolean(identityId))
    );

    const missingIdentityIds = candidateIdentityIds.filter(identityId => !existingIdentitySet.has(identityId));

    if (missingIdentityIds.length === 0) {
      return;
    }

    const { data: identityRecordsRaw, error: identityRecordsError } = await supabase
      .from('telegram_identities')
      .select('id, tg_user_id, username, full_name')
      .in('id', missingIdentityIds);

    if (identityRecordsError) {
      console.error('Error loading telegram identities for participants ensure:', identityRecordsError);
      return;
    }

    const identityRecords = (identityRecordsRaw || []) as IdentityRecord[];
    const nowIso = new Date().toISOString();

    const insertPayload = identityRecords
      .filter((identity: IdentityRecord) => Boolean(identity?.id))
      .map((identity: IdentityRecord) => {
        const identityId = identity.id as string;
        const metrics = identityActivity.get(identityId) ?? { last_activity: null, event_count: 0 };

        const lastActivity = pickLatestTimestamp(
          metrics.last_activity ?? null,
          identityActivity.get(identityId)?.last_activity ?? null
        );
        const eventCount = metrics.event_count ?? 0;

        return {
          org_id: orgId,
          identity_id: identityId,
          tg_user_id: identity.tg_user_id ?? null,
          username: identity.username ?? null,
          full_name:
            identity.full_name ??
            identity.username ??
            (identity.tg_user_id ? `User ${identity.tg_user_id}` : 'Telegram user'),
          last_activity_at: lastActivity,
          activity_score: eventCount,
          risk_score: calculateRiskScore(lastActivity)
        };
      });

    if (insertPayload.length === 0 || reaggregateOnly) {
      return;
    }

    await supabase
      .from('participants')
      .upsert(insertPayload, { onConflict: 'org_id,identity_id' });
  } catch (error) {
    console.error('Error ensuring participants from global activity:', error);
  }
}

async function ensureParticipantsFromExistingOrganizations(
  supabase: any,
  orgId: string,
  chatIds: number[],
  reaggregateOnly = false
) {
  if (!chatIds || chatIds.length === 0) {
    return;
  }

  try {
    const { data: existingOrgParticipants, error: existingOrgError } = await supabase
      .from('participants')
      .select('identity_id, tg_user_id')
      .eq('org_id', orgId);

    if (existingOrgError) {
      console.error('Error loading existing participants for org fallback:', existingOrgError);
      return;
    }

    const existingIdentitySet = new Set(
      (existingOrgParticipants || [])
        .map((row: any) => row.identity_id as string | null)
        .filter((identityId: string | null): identityId is string => Boolean(identityId))
    );
    const existingUserSet = new Set(
      (existingOrgParticipants || [])
        .map((row: any) => row.tg_user_id as number | null)
        .filter((tgUserId: number | null): tgUserId is number => typeof tgUserId === 'number')
    );

    const { data: crossOrgLinks, error: crossOrgError } = await supabase
      .from('participant_groups')
      .select('tg_group_id, participants!inner(id, org_id, identity_id, tg_user_id, username, full_name, last_activity_at, activity_score, risk_score)')
      .in('tg_group_id', chatIds);

    if (crossOrgError) {
      const errorCode = (crossOrgError as any)?.code;
      if (errorCode && errorCode !== '42P01') {
        console.error('Error inspecting cross-org participants:', crossOrgError);
      }
      return;
    }

    const identityCandidates = new Map<string, CrossOrgCandidate>();
    const userCandidates = new Map<number, CrossOrgCandidate>();

    (crossOrgLinks || []).forEach((link: any) => {
      const participant = link?.participants as (RawParticipant & { org_id: string } | null);
      if (!participant) {
        return;
      }

      if (participant.org_id === orgId) {
        return;
      }

      const candidate: CrossOrgCandidate = {
        id: participant.identity_id ?? null,
        tg_user_id: participant.tg_user_id ?? null,
        username: participant.username ?? null,
        full_name: participant.full_name ?? null,
        last_activity_at: participant.last_activity_at ?? null,
        activity_score: participant.activity_score ?? null,
        risk_score: participant.risk_score ?? null
      };

      if (participant.identity_id) {
        const identityId = participant.identity_id;
        const existing = identityCandidates.get(identityId);
        const candidateTs = candidate.last_activity_at ? new Date(candidate.last_activity_at).getTime() : 0;
        const existingTs = existing?.last_activity_at ? new Date(existing.last_activity_at).getTime() : 0;

        if (!existing || candidateTs > existingTs) {
          identityCandidates.set(identityId, candidate);
        }
      } else if (participant.tg_user_id != null) {
        const tgUserId = participant.tg_user_id;
        const existing = userCandidates.get(tgUserId);
        const candidateTs = candidate.last_activity_at ? new Date(candidate.last_activity_at).getTime() : 0;
        const existingTs = existing?.last_activity_at ? new Date(existing.last_activity_at).getTime() : 0;

        if (!existing || candidateTs > existingTs) {
          userCandidates.set(tgUserId, candidate);
        }
      }
    });

    const insertPayload: Array<Partial<Participant> & { org_id: string }> = [];
    const nowIso = new Date().toISOString();

    identityCandidates.forEach((candidate, identityId) => {
      if (existingIdentitySet.has(identityId)) {
        return;
      }

      const lastActivity = pickLatestTimestamp(candidate.last_activity_at, null) ?? nowIso;
      const activityScore = candidate.activity_score ?? 0;
      const riskScore = calculateRiskScore(lastActivity, candidate.risk_score);

      insertPayload.push({
        org_id: orgId,
        identity_id: identityId,
        tg_user_id: candidate.tg_user_id ?? null,
        username: candidate.username ?? null,
        full_name: candidate.full_name ?? null,
        last_activity_at: lastActivity,
        activity_score: activityScore,
        risk_score: riskScore
      });
    });

    userCandidates.forEach((candidate, tgUserId) => {
      if (existingUserSet.has(tgUserId)) {
        return;
      }

      const lastActivity = pickLatestTimestamp(candidate.last_activity_at, null) ?? nowIso;
      const activityScore = candidate.activity_score ?? 0;
      const riskScore = calculateRiskScore(lastActivity, candidate.risk_score);

      insertPayload.push({
        org_id: orgId,
        tg_user_id: tgUserId,
        username: candidate.username ?? null,
        full_name: candidate.full_name ?? null,
        last_activity_at: lastActivity,
        activity_score: activityScore,
        risk_score: riskScore
      });
    });

    if (insertPayload.length === 0 || reaggregateOnly) {
      return;
    }

    const { error: insertError } = await supabase
      .from('participants')
      .upsert(insertPayload);

    if (insertError) {
      console.error('Error inserting participants from existing organizations:', insertError);
    }
  } catch (error) {
    console.error('Unexpected error ensuring participants from existing orgs:', error);
  }
}

async function refreshParticipantMetrics(
  supabase: any,
  orgId: string,
  participants: Participant[],
  chatIds: number[],
  reaggregateOnly = false
): Promise<Participant[]> {
  if (!participants || participants.length === 0) {
    return participants;
  }

  const participantById = new Map<string, Participant>();
  const participantByIdentity = new Map<string, Participant>();
  const participantByUser = new Map<number, Participant>();

  participants.forEach(participant => {
    participantById.set(participant.id, participant);
    if (participant.identity_id) {
      participantByIdentity.set(participant.identity_id, participant);
    }
    if (participant.tg_user_id != null) {
      participantByUser.set(participant.tg_user_id, participant);
    }
  });

  const updates = new Map<
    string,
    {
      last_activity_at: string | null;
      activity_score: number;
      risk_score: number;
      full_name?: string | null;
      username?: string | null;
    }
  >();

  const identityIdsToFetch: Set<string> = new Set();
  const tgUserIdsToFetch: Set<number> = new Set();

  participants.forEach(participant => {
    if (!participant.username || !participant.full_name) {
      if (participant.identity_id) {
        identityIdsToFetch.add(participant.identity_id);
      }
      if (participant.tg_user_id != null) {
        tgUserIdsToFetch.add(participant.tg_user_id);
      }
    }
  });

  let identityMetaMap: Map<string, { full_name: string | null; username: string | null }> | null = null;

  if (identityIdsToFetch.size > 0 || tgUserIdsToFetch.size > 0) {
    try {
      const filters: string[] = [];
      if (identityIdsToFetch.size > 0) {
        filters.push(`id.in.(${Array.from(identityIdsToFetch).join(',')})`);
      }
      if (tgUserIdsToFetch.size > 0) {
        filters.push(`tg_user_id.in.(${Array.from(tgUserIdsToFetch).join(',')})`);
      }

      const { data: identityRows, error: identityRowsError } = await supabase
        .from('telegram_identities')
        .select('id, tg_user_id, username, first_name, last_name, full_name')
        .or(filters.join(','));

      if (identityRowsError) {
        console.error('Error loading identities for participants:', identityRowsError);
      } else if (identityRows) {
        identityMetaMap = new Map();
        identityRows.forEach((row: any) => {
          const idKey = row?.id ? String(row.id) : null;
          const tgKey = row?.tg_user_id != null ? String(row.tg_user_id) : null;
          const fullName =
            row?.full_name ||
            [row?.first_name, row?.last_name].filter(Boolean).join(' ') ||
            null;
          const entry = {
            full_name: fullName,
            username: row?.username ?? null
          };
          if (idKey) {
            identityMetaMap!.set(idKey, entry);
          }
          if (tgKey) {
            identityMetaMap!.set(tgKey, entry);
          }
        });
      }
    } catch (identityLoadError) {
      console.error('Unexpected error loading identities for participants:', identityLoadError);
    }
  }

  if (identityMetaMap) {
    participants.forEach(participant => {
      let update: { full_name?: string | null; username?: string | null } | undefined;
      if (participant.identity_id && identityMetaMap!.has(participant.identity_id)) {
        update = identityMetaMap!.get(participant.identity_id);
      } else if (participant.tg_user_id != null && identityMetaMap!.has(String(participant.tg_user_id))) {
        update = identityMetaMap!.get(String(participant.tg_user_id));
      }
      if (update) {
        updates.set(participant.id, {
          last_activity_at: participant.last_activity_at ?? null,
          activity_score: participant.activity_score ?? 0,
          risk_score: participant.risk_score ?? calculateRiskScore(participant.last_activity_at ?? null),
          full_name: update.full_name ?? participant.full_name ?? null,
          username: update.username ?? participant.username ?? null
        });
      }
    });
  }

  const telegramUsernameUpdates = await refreshUsernamesFromTelegram(
    supabase,
    participants,
    identityMetaMap ?? undefined
  );

  telegramUsernameUpdates.forEach((entry, participantId) => {
    const base = participantById.get(participantId);
    if (!base) {
      return;
    }

    const current = updates.get(participantId) || {
      last_activity_at: base.last_activity_at ?? null,
      activity_score: base.activity_score ?? 0,
      risk_score: base.risk_score ?? calculateRiskScore(base.last_activity_at ?? null),
      full_name: base.full_name ?? null,
      username: base.username ?? null
    };

    updates.set(participantId, {
      ...current,
      full_name: entry.full_name ?? current.full_name,
      username: entry.username ?? current.username
    });
  });

  if (chatIds && chatIds.length > 0) {
    try {
      const { data: globalAggregates, error: globalAggregatesError } = await supabase
        .from('telegram_activity_events')
        .select('identity_id, tg_user_id, event_count:count(id), last_activity:max(created_at)')
        .in('tg_chat_id', chatIds)
        .group('identity_id, tg_user_id');

      if (globalAggregatesError) {
        const errorCode = (globalAggregatesError as any)?.code;
        if (errorCode && errorCode !== '42P01') {
          console.error('Error aggregating global activity for participants:', globalAggregatesError);
        }
      } else {
        (globalAggregates || []).forEach((row: ActivityAggregateRow) => {
          const identityId = row.identity_id ?? null;
          const tgUserId = row.tg_user_id ?? null;

          let participant: Participant | undefined;
          if (identityId && participantByIdentity.has(identityId)) {
            participant = participantByIdentity.get(identityId);
          } else if (tgUserId != null && participantByUser.has(tgUserId)) {
            participant = participantByUser.get(tgUserId);
          }

          if (!participant) {
            return;
          }

          const aggregatedLast = row.last_activity ?? null;
          const aggregatedCount =
            typeof row.event_count === 'number'
              ? row.event_count
              : Number(row.event_count ?? 0);

          const mergedLastActivity = pickLatestTimestamp(participant.last_activity_at ?? null, aggregatedLast);
          const activityScore = Math.max(0, Math.round(aggregatedCount));
          const riskScore = calculateRiskScore(mergedLastActivity, participant.risk_score);

          const identityMeta = identityMetaMap?.get(identityId || String(tgUserId)) || null;

          updates.set(participant.id, {
            last_activity_at: mergedLastActivity,
            activity_score: activityScore,
            risk_score: riskScore,
            full_name: identityMeta?.full_name ?? participant.full_name ?? null,
            username: identityMeta?.username ?? participant.username ?? null
          });
        });
      }
    } catch (aggregateError) {
      console.error('Unexpected error aggregating global activity:', aggregateError);
    }
  }

  const missingForLegacy = participants
    .map(participant => participant.id)
    .filter(participantId => !updates.has(participantId));

  if (missingForLegacy.length > 0) {
    try {
      const { data: legacyAggregates, error: legacyAggregatesError } = await supabase
        .from('activity_events')
        .select('participant_id, event_count:count(id), last_activity:max(created_at)')
        .eq('org_id', orgId)
        .in('participant_id', missingForLegacy)
        .group('participant_id');

      if (legacyAggregatesError) {
        const errorCode = (legacyAggregatesError as any)?.code;
        if (errorCode && errorCode !== '42P01') {
          console.error('Error aggregating legacy activity events:', legacyAggregatesError);
        }
      } else {
        (legacyAggregates || []).forEach((row: LegacyAggregateRow) => {
          const participant = participantById.get(row.participant_id);
          if (!participant) {
            return;
          }

          const aggregatedLast = row.last_activity ?? null;
          const aggregatedCount =
            typeof row.event_count === 'number'
              ? row.event_count
              : Number(row.event_count ?? 0);

          const mergedLastActivity = pickLatestTimestamp(participant.last_activity_at ?? null, aggregatedLast);
          const activityScore = Math.max(0, Math.round(aggregatedCount));
          const riskScore = calculateRiskScore(mergedLastActivity, participant.risk_score);

          const identityMeta = identityMetaMap?.get(participant.identity_id || String(participant.tg_user_id)) || null;

          updates.set(participant.id, {
            last_activity_at: mergedLastActivity,
            activity_score: activityScore,
            risk_score: riskScore,
            full_name: identityMeta?.full_name ?? participant.full_name ?? null,
            username: identityMeta?.username ?? participant.username ?? null
          });
        });
      }
    } catch (legacyAggregateError) {
      console.error('Unexpected error aggregating legacy activity:', legacyAggregateError);
    }
  }

  if (updates.size === 0) {
    return participants;
  }

  const updatedParticipants: Participant[] = [];
  const upsertPayload: Array<{
    id: string;
    org_id: string;
    last_activity_at: string | null;
    activity_score: number;
    risk_score: number;
    full_name?: string | null;
    username?: string | null;
  }> = [];

  participants.forEach(participant => {
    const metrics = updates.get(participant.id);
    if (!metrics) {
      updatedParticipants.push(participant);
      return;
    }

    const nextLastActivity = metrics.last_activity_at ?? participant.last_activity_at ?? null;
    const nextActivityScore = Math.max(0, Math.round(metrics.activity_score ?? participant.activity_score ?? 0));
    const nextRiskScore = Math.max(
      0,
      Math.min(100, Math.round(metrics.risk_score ?? calculateRiskScore(nextLastActivity, participant.risk_score)))
    );

    const nextFullName = metrics.full_name ?? participant.full_name ?? null;
    const nextUsername = metrics.username ?? participant.username ?? null;

    const hasChanged =
      participant.last_activity_at !== nextLastActivity ||
      (participant.activity_score ?? 0) !== nextActivityScore ||
      (participant.risk_score ?? 0) !== nextRiskScore ||
      participant.full_name !== nextFullName ||
      participant.username !== nextUsername;

    const updatedParticipant: Participant = {
      ...participant,
      last_activity_at: nextLastActivity,
      activity_score: nextActivityScore,
      risk_score: nextRiskScore,
      full_name: nextFullName,
      username: nextUsername
    };

    updatedParticipants.push(updatedParticipant);

    if (!reaggregateOnly && hasChanged) {
      upsertPayload.push({
        id: participant.id,
        org_id: orgId,
        last_activity_at: nextLastActivity,
        activity_score: nextActivityScore,
        risk_score: nextRiskScore,
        full_name: nextFullName,
        username: nextUsername
      });
    }
  });

  if (!reaggregateOnly && upsertPayload.length > 0) {
    try {
      const { error: metricUpdateError } = await supabase
        .from('participants')
        .upsert(upsertPayload, { onConflict: 'id' });

      if (metricUpdateError) {
        console.error('Error updating participant metrics:', metricUpdateError);
      }
    } catch (metricUpdateException) {
      console.error('Unexpected error updating participant metrics:', metricUpdateException);
    }
  }

  return updatedParticipants;
}

async function refreshUsernamesFromTelegram(
  supabase: any,
  participants: Participant[],
  identityMap?: Map<string, { full_name: string | null; username: string | null }>
): Promise<Map<string, { full_name: string | null; username: string | null }>> {
  const updates = new Map<string, { full_name: string | null; username: string | null }>();
  return updates;
}

async function fetchParticipantsWithGroups(
  supabase: any,
  orgId: string,
  chatIds: number[],
  reaggregateOnly = false
): Promise<Participant[]> {
  const { data: participantRows, error } = await supabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId);

  if (error) {
    console.error('Error loading participants:', error);
    throw error;
  }

  if (!participantRows || participantRows.length === 0) {
    return [];
  }

  const normalized = normalizeParticipants(participantRows as RawParticipant[]);
  const participantIds = normalized.map(participant => participant.id);

  let participantsWithMetrics = normalized;

  if (participantIds.length > 0) {
    participantsWithMetrics = await refreshParticipantMetrics(
      supabase,
      orgId,
      normalized,
      chatIds,
      reaggregateOnly
    );
  }

  const { data: groupCounts, error: groupsError } = await supabase
    .from('participant_groups')
    .select('participant_id', { count: 'exact', head: false })
    .in('participant_id', participantIds)
    .eq('is_active', true);

  if (groupsError) {
    console.error('Error fetching participant groups:', groupsError);
    return participantsWithMetrics;
  }

  const countsMap = new Map<string, number>();

  (groupCounts || []).forEach((row: any) => {
    const participantId = row?.participant_id as string | undefined;
    if (!participantId) {
      return;
    }

    const current = countsMap.get(participantId) ?? 0;
    countsMap.set(participantId, current + 1);
  });

  return participantsWithMetrics.map(participant => ({
    ...participant,
    group_count: countsMap.get(participant.id) ?? 0
  }));
}

export default async function MembersPage({ params }: { params: { org: string } }) {
  try {
    await requireOrgAccess(params.org);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false
        }
      }
    );

    const telegramGroups = (await getOrgTelegramGroups(params.org)) || [];
    const chatIds = telegramGroups
      .map(group => Number(group.tg_chat_id))
      .filter(chatId => Number.isFinite(chatId)) as number[];

    let participants = await fetchParticipantsWithGroups(supabase, params.org, chatIds);

    if (participants.length === 0 && chatIds.length > 0) {
      await ensureParticipantsFromGlobalActivity(supabase, params.org, chatIds);
      participants = await fetchParticipantsWithGroups(supabase, params.org, chatIds);
    }

    if (participants.length === 0 && chatIds.length > 0) {
      await ensureParticipantsFromExistingOrganizations(supabase, params.org, chatIds);
      participants = await fetchParticipantsWithGroups(supabase, params.org, chatIds);
    }

    if (participants.length === 0) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/participants/backfill-orphans`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ orgId: params.org, chatIds })
        });
      } catch (backfillRequestError) {
        console.error('Error calling backfill API:', backfillRequestError);
      }

      participants = await fetchParticipantsWithGroups(supabase, params.org, chatIds);
    }

    if (participants.length > 0) {
      participants = await fetchParticipantsWithGroups(supabase, params.org, chatIds, true);
    }

    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/members`} telegramGroups={telegramGroups}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Members</h1>
          <Link href={`/app/${params.org}/members/add`}>
            <Button>Add Member</Button>
          </Link>
        </div>
        <Card>
          <CardContent>
            <Input placeholder="Search members..." />
            <div className="mt-4">
              <h2 className="text-lg font-semibold mb-2">All Members</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Telegram ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Groups
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Activity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Risk
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {participants.map(participant => (
                      <tr key={participant.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {participant.full_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {participant.username || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {participant.tg_user_id || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {participant.group_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {participant.activity_score}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {participant.risk_score}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Link href={`/app/${params.org}/members/${participant.id}`}>
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  } catch (error) {
    console.error('Members page error:', error);
    return notFound();
  }
}


