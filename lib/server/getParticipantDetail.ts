import { createAdminServer } from '@/lib/server/supabaseServer';
import type {
  ParticipantDetailResult,
  ParticipantGroupLink,
  ParticipantTrait,
  ParticipantRecord,
  ParticipantTimelineEvent,
  ParticipantExternalId,
  ParticipantAuditRecord
} from '@/lib/types/participant';

export async function getParticipantDetail(orgId: string, participantId: string): Promise<ParticipantDetailResult | null> {
  const supabase = createAdminServer();

  const { data: requestedParticipant, error: participantError } = await supabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError) {
    console.error('Error loading participant record:', participantError);
    throw participantError;
  }

  if (!requestedParticipant) {
    return null;
  }

  const canonicalId = requestedParticipant.merged_into || requestedParticipant.id;

  let participantRecord = requestedParticipant;

  if (canonicalId !== requestedParticipant.id) {
    const { data: canonicalRecord, error: canonicalError } = await supabase
      .from('participants')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', canonicalId)
      .maybeSingle();

    if (canonicalError) {
      console.error('Error loading canonical participant record:', canonicalError);
      throw canonicalError;
    }

    if (canonicalRecord) {
      participantRecord = canonicalRecord;
    }
  }

  const { data: duplicates, error: duplicatesError } = await supabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
    .eq('merged_into', canonicalId)
    .neq('id', canonicalId);

  if (duplicatesError) {
    console.error('Error loading duplicates:', duplicatesError);
    throw duplicatesError;
  }

  const { data: traitsData, error: traitsError } = await supabase
    .from('participant_traits')
    .select('*')
    .eq('participant_id', canonicalId)
    .order('updated_at', { ascending: false });

  if (traitsError) {
    console.error('Error loading participant traits:', traitsError);
    throw traitsError;
  }

  const { data: groupLinks, error: linksError } = await supabase
    .from('participant_groups')
    .select('tg_group_id, joined_at, left_at, is_active')
    .eq('participant_id', canonicalId);

  if (linksError) {
    console.error('Error loading participant group links:', linksError);
    throw linksError;
  }

  let groupDetailsMap = new Map<string, { title: string | null; tg_chat_id: string; bot_status: string | null }>();

  if (groupLinks && groupLinks.length > 0) {
    const chatIds = Array.from(new Set(groupLinks.map(link => String(link.tg_group_id))));

    if (chatIds.length > 0) {
      const { data: groupRecords, error: groupRecordsError } = await supabase
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status')
        .in('tg_chat_id', chatIds);

      if (groupRecordsError) {
        console.error('Error loading group details for participant:', groupRecordsError);
        throw groupRecordsError;
      }

      groupRecords?.forEach(record => {
        groupDetailsMap.set(String(record.tg_chat_id), {
          title: record.title,
          tg_chat_id: String(record.tg_chat_id),
          bot_status: record.bot_status ?? null
        });
      });
    }
  }

  const groups: ParticipantGroupLink[] = (groupLinks || []).map(link => {
    const key = String(link.tg_group_id);
    const detail = groupDetailsMap.get(key);

    return {
      tg_chat_id: detail?.tg_chat_id ?? key,
      tg_group_id: key,
      title: detail?.title ?? null,
      bot_status: detail?.bot_status ?? null,
      is_active: Boolean(link.is_active),
      joined_at: link.joined_at,
      left_at: link.left_at
    };
  });

  // REMOVED: identity_id and telegram_activity_events usage
  // Migration 42 removed these, use activity_events with tg_user_id instead
  
  let eventsData: ParticipantTimelineEvent[] = [];

  const tgUserId = participantRecord.tg_user_id;

  if (tgUserId) {
    let accessibleChatIds: string[] = [];

    try {
      const { data: accessibleChats, error: chatsError } = await supabase
        .from('org_telegram_groups')
        .select('tg_chat_id, status')
        .eq('org_id', orgId);

      if (chatsError) {
        if (chatsError.code !== '42703' && chatsError.code !== '42P01') {
          console.error('Error loading accessible chats for participant:', chatsError);
          throw chatsError;
        }
      }

      (accessibleChats || []).forEach(chat => {
        if (!chat?.tg_chat_id) return;
        if (!chat.status || chat.status === 'active') {
          accessibleChatIds.push(String(chat.tg_chat_id));
        }
      });
    } catch (chatError) {
      console.error('Unexpected error while loading accessible chats:', chatError);
    }

    groups.forEach(group => {
      accessibleChatIds.push(String(group.tg_chat_id));
    });

    accessibleChatIds = Array.from(new Set(accessibleChatIds));

    if (accessibleChatIds.length > 0) {
      const numericChatIds = accessibleChatIds
        .map(id => Number(id))
        .filter(id => !Number.isNaN(id));

      if (numericChatIds.length > 0) {
        try {
          // Use activity_events (not telegram_activity_events)
          const { data: activityEvents, error: activityEventsError } = await supabase
            .from('activity_events')
            .select('id, event_type, created_at, tg_chat_id, meta, message_id, reply_to_message_id')
            .eq('tg_user_id', tgUserId)
            .eq('org_id', orgId)
            .in('tg_chat_id', numericChatIds)
            .order('created_at', { ascending: false })
            .limit(200);

          if (activityEventsError) {
            console.error('Error loading activity events:', activityEventsError);
            throw activityEventsError;
          } else if (activityEvents) {
            eventsData = activityEvents.map(event => ({
              id: event.id,
              event_type: event.event_type,
              created_at: event.created_at,
              tg_chat_id: String(event.tg_chat_id),
              meta: event.meta || null
            }));
          }
        } catch (activityError) {
          console.error('Error loading activity events:', activityError);
        }
      }
    }
  }

  // Fallback to legacy activity_events if global data is empty
  if (eventsData.length === 0) {
    try {
      const { data: legacyEvents, error: legacyError } = await supabase
        .from('activity_events')
        .select('id, event_type, created_at, tg_chat_id, meta')
        .eq('org_id', orgId)
        .eq('participant_id', canonicalId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (legacyError) {
        console.error('Error loading legacy participant events:', legacyError);
        throw legacyError;
      }

      eventsData = (legacyEvents || []).map(event => ({
        id: event.id,
        event_type: event.event_type,
        created_at: event.created_at,
        tg_chat_id: event.tg_chat_id ? String(event.tg_chat_id) : null,
        meta: event.meta || null
      }));
    } catch (legacyException) {
      console.error('Failed to load fallback participant events:', legacyException);
    }
  }

  const { data: externalIdsData, error: externalIdsError } = await supabase
    .from('participant_external_ids')
    .select('system_code, external_id, url, data')
    .eq('org_id', orgId)
    .eq('participant_id', canonicalId);

  if (externalIdsError) {
    console.error('Error loading participant external IDs:', externalIdsError);
    throw externalIdsError;
  }

  const externalIds = (externalIdsData || []).map(row => ({
    system_code: row.system_code,
    external_id: row.external_id,
    url: row.url,
    data: row.data,
    label: row.system_code
  })) as ParticipantExternalId[];

  let auditLog: ParticipantAuditRecord[] = [];
  try {
    const { data: auditLogData, error: auditError } = await supabase
      .from('participant_audit_log')
      .select('*')
      .eq('org_id', orgId)
      .eq('participant_id', canonicalId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (auditError) {
      if ((auditError as any)?.code === '42P01') {
        console.warn('participant_audit_log table not found, skipping audit trail');
      } else {
        console.error('Error loading participant audit log:', auditError);
        throw auditError;
      }
    }

    auditLog = (auditLogData || []) as ParticipantAuditRecord[];
  } catch (auditException) {
    console.error('Unexpected error while loading audit log:', auditException);
    auditLog = [];
  }

  return {
    participant: participantRecord as ParticipantRecord,
    canonicalParticipantId: canonicalId,
    requestedParticipantId: participantId,
    duplicates: (duplicates || []) as ParticipantRecord[],
    traits: (traitsData || []) as ParticipantTrait[],
    groups,
    events: eventsData,
    externalIds,
    auditLog
  };
}
