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
      // Загружаем все группы организации для активности участника
      // Не фильтруем по status, чтобы показывать всю активность
      const { data: accessibleChats, error: chatsError } = await supabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);

      if (chatsError) {
        if (chatsError.code !== '42703' && chatsError.code !== '42P01') {
          console.error('Error loading accessible chats for participant:', chatsError);
          // Не бросаем ошибку, продолжаем с группами из participant_groups
        }
      } else {
        (accessibleChats || []).forEach(chat => {
          if (chat?.tg_chat_id) {
            accessibleChatIds.push(String(chat.tg_chat_id));
          }
        });
      }
    } catch (chatError) {
      console.error('Unexpected error while loading accessible chats:', chatError);
      // Продолжаем с группами из participant_groups
    }

    // Добавляем группы из participant_groups
    groups.forEach(group => {
      accessibleChatIds.push(String(group.tg_chat_id));
    });

    accessibleChatIds = Array.from(new Set(accessibleChatIds));

    // Если нет групп из org_telegram_groups, но есть группы из participant_groups, используем их
    // Если вообще нет групп, загружаем события для всех групп организации
    if (accessibleChatIds.length === 0) {
      console.log(`[getParticipantDetail] No accessible chat IDs found, loading all org groups for activity`);
      try {
        const { data: allOrgChats } = await supabase
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', orgId);
        
        if (allOrgChats && allOrgChats.length > 0) {
          allOrgChats.forEach(chat => {
            if (chat?.tg_chat_id) {
              accessibleChatIds.push(String(chat.tg_chat_id));
            }
          });
          console.log(`[getParticipantDetail] Fallback: loaded ${accessibleChatIds.length} org groups`);
        } else {
          console.log(`[getParticipantDetail] No org groups found, will load events without chat_id filter`);
        }
      } catch (fallbackError) {
        console.error('Error loading fallback org chats:', fallbackError);
      }
    } else {
      console.log(`[getParticipantDetail] Found ${accessibleChatIds.length} accessible chat IDs`);
    }

    // Загружаем события даже если нет групп - просто без фильтра по chat_id
    // Загружаем события для всех доступных групп
    const numericChatIds = accessibleChatIds
      .map(id => Number(id))
      .filter(id => !Number.isNaN(id));

    console.log(`[getParticipantDetail] Loading activity events for tg_user_id=${tgUserId}, org_id=${orgId}, accessible_chat_ids=${accessibleChatIds.length}, numeric_chat_ids=${numericChatIds.length}`);
    console.log(`[getParticipantDetail] Chat IDs to filter: ${JSON.stringify(numericChatIds)}`);

    try {
      // Сначала проверим, есть ли вообще события для этого пользователя и организации (без фильтра по chat_id)
      const { data: allEventsCheck, error: checkError } = await supabase
        .from('activity_events')
        .select('tg_chat_id, created_at, org_id')
        .eq('tg_user_id', tgUserId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (checkError) {
        console.error(`[getParticipantDetail] Error checking events:`, checkError);
      } else {
        const uniqueChatIds = Array.from(new Set((allEventsCheck || []).map(e => e.tg_chat_id)));
        console.log(`[getParticipantDetail] Found ${allEventsCheck?.length || 0} total events for user in org, in ${uniqueChatIds.length} different chats: ${JSON.stringify(uniqueChatIds)}`);
        
        // Проверим пересечение
        const matchingChatIds = uniqueChatIds.filter(id => numericChatIds.includes(Number(id)));
        console.log(`[getParticipantDetail] Matching chat IDs: ${JSON.stringify(matchingChatIds)}`);
        
        // Если событий нет, проверим, есть ли события для этого tg_user_id в других организациях
        if (allEventsCheck?.length === 0) {
          const { data: otherOrgEvents, error: otherOrgError } = await supabase
            .from('activity_events')
            .select('org_id, tg_chat_id, created_at')
            .eq('tg_user_id', tgUserId)
            .order('created_at', { ascending: false })
            .limit(5);
          
          if (!otherOrgError && otherOrgEvents && otherOrgEvents.length > 0) {
            const otherOrgIds = Array.from(new Set(otherOrgEvents.map(e => e.org_id)));
            console.log(`[getParticipantDetail] ⚠️ Found ${otherOrgEvents.length} events for tg_user_id=${tgUserId} in OTHER orgs: ${JSON.stringify(otherOrgIds)}`);
          } else {
            console.log(`[getParticipantDetail] ⚠️ No events found for tg_user_id=${tgUserId} in ANY organization`);
          }
          
          // Проверим, есть ли события для этой организации с другими tg_user_id
          const { data: orgEvents, error: orgEventsError } = await supabase
            .from('activity_events')
            .select('tg_user_id, tg_chat_id, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(5);
          
          if (!orgEventsError && orgEvents && orgEvents.length > 0) {
            const otherUserIds = Array.from(new Set(orgEvents.map(e => e.tg_user_id)));
            console.log(`[getParticipantDetail] ⚠️ Found ${orgEvents.length} events for org_id=${orgId} with OTHER tg_user_ids: ${JSON.stringify(otherUserIds)}`);
          } else {
            console.log(`[getParticipantDetail] ⚠️ No events found for org_id=${orgId} with ANY tg_user_id`);
          }
        }
      }

      // Use activity_events (not telegram_activity_events)
      // ВАЖНО: Не фильтруем по org_id, так как группы и участники могут быть в разных организациях
      // Показываем события для участника, если группа добавлена в текущую организацию
      let query = supabase
        .from('activity_events')
        .select('id, event_type, created_at, tg_chat_id, meta, message_id, reply_to_message_id, org_id')
        .eq('tg_user_id', tgUserId);
      
      // Добавляем фильтр по chat_id только если есть валидные группы
      // Это гарантирует, что показываем только события из групп, добавленных в текущую организацию
      if (numericChatIds.length > 0) {
        query = query.in('tg_chat_id', numericChatIds);
        console.log(`[getParticipantDetail] Filtering by ${numericChatIds.length} chat IDs (ignoring org_id filter): ${JSON.stringify(numericChatIds)}`);
      } else {
        console.log(`[getParticipantDetail] No valid chat IDs, loading all events without chat filter`);
      }
      
      const { data: activityEvents, error: activityEventsError } = await query
        .order('created_at', { ascending: false })
        .limit(200);

      console.log(`[getParticipantDetail] Loaded ${activityEvents?.length || 0} activity events`);
      if (activityEventsError) {
        console.error(`[getParticipantDetail] Query error:`, activityEventsError);
      }

      if (activityEventsError) {
        console.error('Error loading activity events:', activityEventsError);
        throw activityEventsError;
      } else if (activityEvents) {
            // Load message texts from participant_messages for message events
            // ⚠️ OPTIMIZED: Single batch query instead of N individual queries
            const messageEventIds = activityEvents
              .filter(e => e.event_type === 'message' && e.message_id)
              .map(e => e.message_id);
            
            let messageTextsMap = new Map<string, string>();
            
            if (messageEventIds.length > 0 && numericChatIds.length > 0) {
              // Single batch query for all message texts
              const { data: messageTexts, error: textsError } = await supabase
                .from('participant_messages')
                .select('tg_chat_id, message_id, message_text')
                .eq('tg_user_id', tgUserId)
                .in('tg_chat_id', numericChatIds)
                .in('message_id', messageEventIds);
              
              if (textsError) {
                console.warn('[getParticipantDetail] Error loading message texts:', textsError);
              } else if (messageTexts) {
                messageTexts.forEach((m: any) => {
                  if (m.message_text) {
                    messageTextsMap.set(`${m.tg_chat_id}_${m.message_id}`, m.message_text);
                  }
                });
                console.log(`[getParticipantDetail] Loaded ${messageTextsMap.size} message texts in single batch`);
              }
            }
            
            eventsData = activityEvents.map(event => {
              const eventMeta = event.meta || {};
              
              // Enhance meta with message text from participant_messages if available
              if (event.event_type === 'message' && event.message_id) {
                const messageKey = `${event.tg_chat_id}_${event.message_id}`;
                const messageText = messageTextsMap.get(messageKey);
                
                if (messageText && !eventMeta.message?.text_preview && !eventMeta.message?.text) {
                  eventMeta.message = eventMeta.message || {};
                  eventMeta.message.text_preview = messageText.slice(0, 500);
                  eventMeta.message.text = messageText;
                }
              }
              
              return {
                id: event.id,
                event_type: event.event_type,
                created_at: event.created_at,
                tg_chat_id: String(event.tg_chat_id),
                meta: eventMeta
              };
            });
      }
    } catch (activityError) {
      console.error('Error loading activity events:', activityError);
    }
  }

  // Load WhatsApp messages (stored with participant_id in meta)
  // These don't have tg_user_id, so we query by meta->>'participant_id'
  try {
    const { data: whatsappEvents, error: waError } = await supabase
      .from('activity_events')
      .select('id, event_type, created_at, tg_chat_id, meta, org_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', 0) // WhatsApp marker
      .filter('meta->>participant_id', 'eq', canonicalId)
      .order('created_at', { ascending: false })
      .limit(200);
    
    if (waError) {
      console.warn('[getParticipantDetail] Error loading WhatsApp events:', waError);
    } else if (whatsappEvents && whatsappEvents.length > 0) {
      console.log(`[getParticipantDetail] Loaded ${whatsappEvents.length} WhatsApp events for participant ${canonicalId}`);
      
      // Add WhatsApp events to eventsData
      const waEventsFormatted = whatsappEvents.map(event => ({
        id: event.id,
        event_type: event.event_type,
        created_at: event.created_at,
        tg_chat_id: 'whatsapp', // Mark as WhatsApp
        meta: event.meta || {}
      }));
      
      // Merge and sort by date
      eventsData = [...eventsData, ...waEventsFormatted].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 200);
    }
  } catch (waError) {
    console.error('[getParticipantDetail] WhatsApp events error:', waError);
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

  // Audit log feature was removed in migration 072
  const auditLog: ParticipantAuditRecord[] = [];

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
