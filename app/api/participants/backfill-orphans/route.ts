import { NextResponse } from 'next/server';
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer';

type ParticipantsBackfillPayload = {
  orgId: string;
  chatIds?: (number | string)[];
  force?: boolean;
};

type IdentityRecord = {
  id: string | null;
  tg_user_id: number | null;
  username: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string | null;
  last_activity_at?: string | null;
  activity_score?: number | null;
  risk_score?: number | null;
};

type ParticipantRow = {
  id: string;
  org_id: string;
  identity_id: string | null;
  tg_user_id: number | null;
  username: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string | null;
  last_activity_at: string | null;
  activity_score: number | null;
  risk_score: number | null;
};

type ActivityEventRecord = {
  identity_id: string | null;
  tg_user_id: number | null;
  tg_chat_id: number;
  created_at: string;
};

async function requireOrgMembership(orgId: string) {
  const supabaseClient = await createClientServer();
  const { data: authResult, error: authError } = await supabaseClient.auth.getUser();

  if (authError || !authResult?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const adminClient = createAdminServer();
  const { data: membership, error: membershipError } = await adminClient
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', authResult.user.id)
    .maybeSingle();

  if (membershipError) {
    console.error('Membership check error:', membershipError);
    return {
      error: NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 })
    };
  }

  if (!membership) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { adminClient, user: authResult.user };
}

function normalizeChatIds(rawChatIds?: (number | string)[]): number[] {
  if (!rawChatIds) {
    return [];
  }

  return rawChatIds
    .map(raw => Number(raw))
    .filter(value => Number.isFinite(value)) as number[];
}

async function collectActivityIdentities(
  adminClient: any,
  chatIds: number[]
): Promise<Map<string, string>> {
  const activityMap = new Map<string, string>();

  if (chatIds.length === 0) {
    return activityMap;
  }

  const { data: activityEvents, error: activityError } = await adminClient
    .from('telegram_activity_events')
    .select('identity_id, tg_user_id, tg_chat_id, created_at')
    .in('tg_chat_id', chatIds)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (activityError) {
    const errorCode = (activityError as any)?.code;
    if (errorCode && errorCode !== '42P01') {
      throw activityError;
    }
    return activityMap;
  }

  const fallbackByUser = new Map<number, string>();

  (activityEvents || []).forEach((event: ActivityEventRecord) => {
    const identityId = event?.identity_id;
    const tgUserId = event?.tg_user_id;
    const createdAt = event?.created_at;

    if (!createdAt) {
      return;
    }

    if (identityId) {
      const existing = activityMap.get(identityId);
      if (!existing || createdAt > existing) {
        activityMap.set(identityId, createdAt);
      }
    } else if (tgUserId != null) {
      const existing = fallbackByUser.get(tgUserId);
      if (!existing || createdAt > existing) {
        fallbackByUser.set(tgUserId, createdAt);
      }
    }
  });

  if (fallbackByUser.size > 0) {
    const { data: identitiesByUser, error: identitiesError } = await adminClient
      .from('telegram_identities')
      .select('id, tg_user_id')
      .in('tg_user_id', Array.from(fallbackByUser.keys()));

    if (identitiesError) {
      throw identitiesError;
    }

    (identitiesByUser || []).forEach((record: { id: string | null; tg_user_id: number | null }) => {
      const identityId = record?.id;
      const tgUserId = record?.tg_user_id;
      if (!identityId || tgUserId == null) {
        return;
      }

      const timestamp = fallbackByUser.get(tgUserId) ?? new Date().toISOString();
      const existing = activityMap.get(identityId);
      if (!existing || timestamp > existing) {
        activityMap.set(identityId, timestamp);
      }
    });
  }

  return activityMap;
}

async function collectCrossOrgParticipants(
  adminClient: any,
  orgId: string,
  chatIds: number[]
): Promise<IdentityRecord[]> {
  if (chatIds.length === 0) {
    return [];
  }

  const { data: participantsByGroup, error } = await adminClient
    .from('participant_groups')
    .select('tg_group_id, participants!inner(id, org_id, identity_id, tg_user_id, username, full_name, last_activity_at, activity_score, risk_score)')
    .in('tg_group_id', chatIds);

  if (error) {
    const errorCode = (error as any)?.code;
    if (errorCode && errorCode !== '42P01') {
      throw error;
    }
    return [];
  }

  const identityMap = new Map<string, IdentityRecord & { last_activity_at?: string | null; activity_score?: number | null; risk_score?: number | null }>();
  const userMap = new Map<number, IdentityRecord & { last_activity_at?: string | null; activity_score?: number | null; risk_score?: number | null }>();

  (participantsByGroup || []).forEach((record: { participants?: ParticipantRow | null }) => {
    const participant = record?.participants as ParticipantRow | null;
    if (!participant) {
      return;
    }

    if (participant.org_id === orgId) {
      return;
    }

    const candidate = {
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
      const existing = identityMap.get(identityId);
      const candidateTimestamp = candidate.last_activity_at ? new Date(candidate.last_activity_at).getTime() : 0;
      const existingTimestamp = existing?.last_activity_at ? new Date(existing.last_activity_at).getTime() : 0;

      if (!existing || candidateTimestamp > existingTimestamp) {
        identityMap.set(identityId, candidate);
      }
    } else if (participant.tg_user_id != null) {
      const tgUserId = participant.tg_user_id;
      const existing = userMap.get(tgUserId);
      const candidateTimestamp = candidate.last_activity_at ? new Date(candidate.last_activity_at).getTime() : 0;
      const existingTimestamp = existing?.last_activity_at ? new Date(existing.last_activity_at).getTime() : 0;

      if (!existing || candidateTimestamp > existingTimestamp) {
        userMap.set(tgUserId, candidate);
      }
    }
  });

  return [
    ...Array.from(identityMap.entries()).map(([identityId, record]) => ({
      id: identityId,
      tg_user_id: record.tg_user_id ?? null,
      username: record.username ?? null,
      full_name: record.full_name ?? null,
      last_activity_at: record.last_activity_at ?? null,
      activity_score: record.activity_score ?? null,
      risk_score: record.risk_score ?? null
    })),
    ...Array.from(userMap.entries()).map(([tgUserId, record]) => ({
      id: null,
      tg_user_id: tgUserId,
      username: record.username ?? null,
      full_name: record.full_name ?? null,
      last_activity_at: record.last_activity_at ?? null,
      activity_score: record.activity_score ?? null,
      risk_score: record.risk_score ?? null
    }))
  ];
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ParticipantsBackfillPayload;
    const orgId = payload?.orgId;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const access = await requireOrgMembership(orgId);
    if ('error' in access) {
      return access.error;
    }

    const adminClient = access.adminClient;
    const chatIdsFromPayload = normalizeChatIds(payload.chatIds);

    const derivedChatIds = new Set<number>(chatIdsFromPayload);

    if (!payload.chatIds || payload.chatIds.length === 0) {
      const { data: orgChats, error: orgChatsError } = await adminClient
        .from('participant_groups')
        .select('tg_group_id')
        .eq('org_id', orgId);

      if (orgChatsError) {
        const errorCode = (orgChatsError as any)?.code;
        if (errorCode && errorCode !== '42P01') {
          console.error('Error loading org participant groups:', orgChatsError);
        }
      } else if (orgChats) {
        orgChats.forEach(record => {
          const chatId = Number(record?.tg_group_id);
          if (Number.isFinite(chatId)) {
            derivedChatIds.add(chatId);
          }
        });
      }
    }

    const chatIds = Array.from(derivedChatIds);

    const activityMap = await collectActivityIdentities(adminClient, chatIds);

    const identityIds = Array.from(activityMap.keys());

    const { data: existingParticipants, error: existingError } = await adminClient
      .from('participants')
      .select('identity_id, merged_into, tg_user_id')
      .eq('org_id', orgId)
      .in('identity_id', identityIds);

    const existingIdentitySet = new Set(
      (existingParticipants || [])
        .filter((row: any) => !row?.merged_into)
        .map((row: any) => row.identity_id as string | null)
        .filter((identityId: string | null): identityId is string => Boolean(identityId))
    );

    if (existingError) {
      const errorCode = (existingError as any)?.code;
      if (errorCode && errorCode !== '42P01') {
        throw existingError;
      }
    }

    const missingIdentityIds = identityIds.filter(identityId => !existingIdentitySet.has(identityId));

    const { data: identityRecordsRaw, error: identityRecordsError } = await adminClient
      .from('telegram_identities')
      .select('id, tg_user_id, username, first_name, last_name, full_name')
      .in('id', missingIdentityIds);

    if (identityRecordsError) {
      throw identityRecordsError;
    }

    const identityRecords = (identityRecordsRaw || []) as IdentityRecord[];
    const nowIsoIdentities = new Date().toISOString();

    const insertPayload = identityRecords
      .filter((identity: IdentityRecord) => Boolean(identity?.id))
      .map((identity: IdentityRecord) => {
        const identityId = identity.id as string;
        const activityTimestamp = activityMap.get(identityId) ?? nowIsoIdentities;

        return {
          org_id: orgId,
          identity_id: identityId,
          tg_user_id: identity.tg_user_id ?? null,
          username: identity.username ?? null,
          first_name: identity.first_name ?? null,
          last_name: identity.last_name ?? null,
          full_name:
            identity.full_name ??
            ([identity.first_name ?? null, identity.last_name ?? null].filter(Boolean).join(' ') ||
              identity.username ||
              (identity.tg_user_id ? `User ${identity.tg_user_id}` : 'Telegram user')),
          source: 'telegram',
          status: 'active',
          updated_at: nowIsoIdentities,
          last_activity_at: activityTimestamp,
          activity_score: null,
          risk_score: null
        };
      })
      .filter(Boolean) as Array<{
        org_id: string;
        identity_id: string | null;
        tg_user_id: number | null;
        username: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name: string | null;
        source?: string;
        status?: string;
        updated_at?: string;
        last_activity_at: string;
        activity_score?: number | null;
        risk_score?: number | null;
      }>;

    const crossOrgRecords = await collectCrossOrgParticipants(adminClient, orgId, chatIds);
    const existingUserSet = new Set(
      (existingParticipants || [])
        .map((row: any) => row.tg_user_id as number | null)
        .filter((tgUserId): tgUserId is number => typeof tgUserId === 'number')
    );

    const nowIso = new Date().toISOString();

    crossOrgRecords.forEach(record => {
      if (record.id && existingIdentitySet.has(record.id)) {
        return;
      }

      if (!record.id && record.tg_user_id != null && existingUserSet.has(record.tg_user_id)) {
        return;
      }

      insertPayload.push({
        org_id: orgId,
        identity_id: record.id ?? null,
        tg_user_id: record.tg_user_id ?? null,
        username: record.username ?? null,
        first_name: record.first_name ?? null,
        last_name: record.last_name ?? null,
        full_name:
          record.full_name ??
          ([record.first_name ?? null, record.last_name ?? null].filter(Boolean).join(' ') || null),
        source: 'telegram',
        status: 'active',
        updated_at: nowIso,
        last_activity_at: record.last_activity_at ?? nowIso,
        activity_score: (record as any).activity_score ?? null,
        risk_score: (record as any).risk_score ?? null
      });
    });

    if (insertPayload.length > 0) {
      const { error: insertError } = await adminClient
        .from('participants')
        .upsert(insertPayload);

      if (insertError) {
        console.error('Error upserting participants during backfill:', insertError);
        return NextResponse.json({ error: 'Failed to backfill participants' }, { status: 500 });
      }
    }

    const { data: updatedParticipants, error: reloadError } = await adminClient
      .from('participants')
      .select('id')
      .eq('org_id', orgId);

    if (reloadError) {
      console.error('Error reloading participants after backfill:', reloadError);
    }

    return NextResponse.json({
      ok: true,
      orgId,
      chatIds,
      inserted: insertPayload.length,
      totalParticipants: updatedParticipants ? updatedParticipants.length : undefined
    });
  } catch (error: any) {
    console.error('Backfill participants error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
