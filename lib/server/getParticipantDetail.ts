import { createAdminServer } from '@/lib/server/supabaseServer';
import type {
  ParticipantDetailResult,
  ParticipantGroupLink,
  ParticipantTrait,
  ParticipantRecord,
  ParticipantTimelineEvent
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

  const identityId = participantRecord.identity_id;

  let eventsData: ParticipantTimelineEvent[] = [];

  if (identityId) {
    const { data: accessibleChats, error: chatsError } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, status')
      .eq('status', 'active')
      .eq('org_id', orgId);

    if (chatsError) {
      console.error('Error loading accessible chats for participant:', chatsError);
      throw chatsError;
    }

    const allowedChatIds = new Set<string>();
    (accessibleChats || []).forEach(chat => {
      allowedChatIds.add(String(chat.tg_chat_id));
    });

    groups.forEach(group => {
      allowedChatIds.add(String(group.tg_chat_id));
    });

    if (allowedChatIds.size > 0) {
      const chatIdArray = Array.from(allowedChatIds).map(id => Number(id)).filter(id => !Number.isNaN(id));

      if (chatIdArray.length > 0) {
        const { data: globalEvents, error: globalEventsError } = await supabase
          .from('telegram_activity_events')
          .select('id, event_type, created_at, tg_chat_id, meta, message_id, reply_to_message_id')
          .eq('identity_id', identityId)
          .in('tg_chat_id', chatIdArray)
          .order('created_at', { ascending: false })
          .limit(200);

        if (globalEventsError) {
          console.error('Error loading global activity events:', globalEventsError);
          throw globalEventsError;
        }

        eventsData = (globalEvents || []).map(event => ({
          id: event.id,
          event_type: event.event_type,
          created_at: event.created_at,
          tg_chat_id: String(event.tg_chat_id),
          meta: event.meta || null
        }));
      }
    }
  }

  return {
    participant: participantRecord as ParticipantRecord,
    canonicalParticipantId: canonicalId,
    requestedParticipantId: participantId,
    duplicates: (duplicates || []) as ParticipantRecord[],
    traits: (traitsData || []) as ParticipantTrait[],
    groups,
    events: eventsData
  };
}
