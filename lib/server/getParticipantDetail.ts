import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import type {
  ParticipantDetailResult,
  ParticipantGroupLink,
  ParticipantTrait,
  ParticipantRecord,
  ParticipantTimelineEvent,
  ParticipantExternalId,
  ParticipantAuditRecord,
  ParticipantEventRegistration
} from '@/lib/types/participant';

export async function getParticipantDetail(orgId: string, participantId: string): Promise<ParticipantDetailResult | null> {
  const logger = createServiceLogger('getParticipantDetail');
  const supabase = createAdminServer();

  const { data: requestedParticipant, error: participantError } = await supabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError) {
    logger.error({ 
      error: participantError.message,
      org_id: orgId,
      participant_id: participantId
    }, 'Error loading participant record');
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
      logger.error({ 
        error: canonicalError.message,
        org_id: orgId,
        participant_id: participantId,
        canonical_id: canonicalId
      }, 'Error loading canonical participant record');
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
    logger.error({ 
      error: duplicatesError.message,
      org_id: orgId,
      participant_id: participantId,
      canonical_id: canonicalId
    }, 'Error loading duplicates');
    throw duplicatesError;
  }

  const { data: traitsData, error: traitsError } = await supabase
    .from('participant_traits')
    .select('*')
    .eq('participant_id', canonicalId)
    .order('updated_at', { ascending: false });

  if (traitsError) {
    logger.error({ 
      error: traitsError.message,
      org_id: orgId,
      participant_id: participantId,
      canonical_id: canonicalId
    }, 'Error loading participant traits');
    throw traitsError;
  }

  const { data: groupLinks, error: linksError } = await supabase
    .from('participant_groups')
    .select('tg_group_id, joined_at, left_at, is_active')
    .eq('participant_id', canonicalId);

  if (linksError) {
    logger.error({ 
      error: linksError.message,
      org_id: orgId,
      participant_id: participantId,
      canonical_id: canonicalId
    }, 'Error loading participant group links');
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
        logger.error({ 
          error: groupRecordsError.message,
          org_id: orgId,
          participant_id: participantId,
          canonical_id: canonicalId
        }, 'Error loading group details for participant');
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

  // Handle bigint that might come as string from PostgreSQL
  const rawTgUserId = participantRecord.tg_user_id;
  const tgUserId = typeof rawTgUserId === 'string' ? parseInt(rawTgUserId, 10) 
    : typeof rawTgUserId === 'number' ? rawTgUserId 
    : null;

  logger.debug({ 
    participant_id: participantId,
    raw_tg_user_id: rawTgUserId,
    raw_type: typeof rawTgUserId,
    parsed_tg_user_id: tgUserId
  }, 'Participant tg_user_id parsing');

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
          logger.error({ 
            error: chatsError.message,
            error_code: chatsError.code,
            org_id: orgId,
            participant_id: participantId,
            tg_user_id: tgUserId
          }, 'Error loading accessible chats for participant');
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
      logger.error({ 
        error: chatError instanceof Error ? chatError.message : String(chatError),
        org_id: orgId,
        participant_id: participantId,
        tg_user_id: tgUserId
      }, 'Unexpected error while loading accessible chats');
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
      logger.debug({ org_id: orgId, participant_id: participantId, tg_user_id: tgUserId }, 'No accessible chat IDs found, loading all org groups for activity');
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
          logger.debug({ 
            org_id: orgId,
            participant_id: participantId,
            chat_count: accessibleChatIds.length
          }, 'Fallback: loaded org groups');
        } else {
          logger.debug({ org_id: orgId, participant_id: participantId }, 'No org groups found, will load events without chat_id filter');
        }
      } catch (fallbackError) {
        logger.error({ 
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          org_id: orgId,
          participant_id: participantId
        }, 'Error loading fallback org chats');
      }
    } else {
      logger.debug({ 
        org_id: orgId,
        participant_id: participantId,
        chat_count: accessibleChatIds.length
      }, 'Found accessible chat IDs');
    }

    // Загружаем события даже если нет групп - просто без фильтра по chat_id
    // Загружаем события для всех доступных групп
    const numericChatIds = accessibleChatIds
      .map(id => Number(id))
      .filter(id => !Number.isNaN(id));

    logger.debug({ 
      tg_user_id: tgUserId,
      org_id: orgId,
      accessible_chat_ids: accessibleChatIds.length,
      numeric_chat_ids: numericChatIds.length,
      chat_ids: numericChatIds
    }, 'Loading activity events');

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
        logger.error({ 
          error: checkError.message,
          org_id: orgId,
          participant_id: participantId,
          tg_user_id: tgUserId
        }, 'Error checking events');
      } else {
        const uniqueChatIds = Array.from(new Set((allEventsCheck || []).map(e => e.tg_chat_id)));
        const matchingChatIds = uniqueChatIds.filter(id => numericChatIds.includes(Number(id)));
        
        logger.debug({ 
          event_count: allEventsCheck?.length || 0,
          unique_chat_count: uniqueChatIds.length,
          unique_chat_ids: uniqueChatIds,
          matching_chat_ids: matchingChatIds,
          org_id: orgId,
          tg_user_id: tgUserId
        }, 'Found events for user in org');
        
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
            logger.warn({ 
              tg_user_id: tgUserId,
              event_count: otherOrgEvents.length,
              other_org_ids: otherOrgIds
            }, 'Found events for tg_user_id in OTHER orgs');
          } else {
            logger.warn({ tg_user_id: tgUserId }, 'No events found for tg_user_id in ANY organization');
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
            logger.warn({ 
              org_id: orgId,
              event_count: orgEvents.length,
              other_user_ids: otherUserIds
            }, 'Found events for org_id with OTHER tg_user_ids');
          } else {
            logger.warn({ org_id: orgId }, 'No events found for org_id with ANY tg_user_id');
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
        logger.debug({ 
          chat_ids: numericChatIds,
          chat_count: numericChatIds.length,
          org_id: orgId,
          tg_user_id: tgUserId
        }, 'Filtering by chat IDs (ignoring org_id filter)');
      } else {
        logger.debug({ org_id: orgId, tg_user_id: tgUserId }, 'No valid chat IDs, loading all events without chat filter');
      }
      
      const { data: activityEvents, error: activityEventsError } = await query
        .order('created_at', { ascending: false })
        .limit(200);

      if (activityEventsError) {
        logger.error({ 
          error: activityEventsError.message,
          org_id: orgId,
          participant_id: participantId,
          tg_user_id: tgUserId
        }, 'Error loading activity events');
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
                logger.warn({ 
                  error: textsError.message,
                  org_id: orgId,
                  participant_id: participantId
                }, 'Error loading message texts');
              } else if (messageTexts) {
                messageTexts.forEach((m: any) => {
                  if (m.message_text) {
                    messageTextsMap.set(`${m.tg_chat_id}_${m.message_id}`, m.message_text);
                  }
                });
                logger.debug({ 
                  message_count: messageTextsMap.size,
                  org_id: orgId,
                  participant_id: participantId
                }, 'Loaded message texts in single batch');
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
      logger.error({ 
        error: activityError instanceof Error ? activityError.message : String(activityError),
        stack: activityError instanceof Error ? activityError.stack : undefined,
        org_id: orgId,
        participant_id: participantId,
        tg_user_id: tgUserId
      }, 'Error loading activity events');
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
      logger.warn({ 
        error: waError.message,
        org_id: orgId,
        participant_id: participantId,
        canonical_id: canonicalId
      }, 'Error loading WhatsApp events');
    } else if (whatsappEvents && whatsappEvents.length > 0) {
      logger.debug({ 
        event_count: whatsappEvents.length,
        org_id: orgId,
        participant_id: participantId,
        canonical_id: canonicalId
      }, 'Loaded WhatsApp events');
      
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
    logger.error({ 
      error: waError instanceof Error ? waError.message : String(waError),
      org_id: orgId,
      participant_id: participantId
    }, 'WhatsApp events error');
  }

  const { data: externalIdsData, error: externalIdsError } = await supabase
    .from('participant_external_ids')
    .select('system_code, external_id, url, data')
    .eq('org_id', orgId)
    .eq('participant_id', canonicalId);

  if (externalIdsError) {
    logger.error({ 
      error: externalIdsError.message,
      org_id: orgId,
      participant_id: participantId,
      canonical_id: canonicalId
    }, 'Error loading participant external IDs');
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

  // Load event registrations for participant
  let eventRegistrations: ParticipantEventRegistration[] = [];
  try {
    const { data: registrations, error: regError } = await supabase
      .from('event_registrations')
      .select(`
        id, event_id, status, registered_at, payment_status, paid_amount, quantity, qr_token, checked_in_at
      `)
      .eq('participant_id', canonicalId)
      .order('registered_at', { ascending: false });

    if (regError) {
      logger.warn({
        error: regError.message,
        participant_id: participantId,
        canonical_id: canonicalId
      }, 'Error loading event registrations');
    } else if (registrations && registrations.length > 0) {
      // Load events separately (no join in Supabase select)
      const eventIds = registrations.map((r: any) => r.event_id);
      const { data: events } = await supabase
        .from('events')
        .select('id, title, event_date, end_date, start_time, end_time, status, location_info, event_type, requires_payment, default_price, cover_image_url')
        .in('id', eventIds);
      
      const eventsMap = new Map((events || []).map((e: any) => [e.id, e]));
      
      eventRegistrations = registrations.map((reg: any) => ({
        id: reg.id,
        event_id: reg.event_id,
        status: reg.status,
        registered_at: reg.registered_at,
        payment_status: reg.payment_status,
        paid_amount: reg.paid_amount,
        quantity: reg.quantity || 1,
        qr_token: reg.qr_token || null,
        checked_in_at: reg.checked_in_at || null,
        event: eventsMap.get(reg.event_id) || null
      }));
      logger.debug({
        participant_id: canonicalId,
        registration_count: eventRegistrations.length
      }, 'Loaded event registrations for participant');
    }
  } catch (regError) {
    logger.error({
      error: regError instanceof Error ? regError.message : String(regError),
      participant_id: participantId,
      canonical_id: canonicalId
    }, 'Error loading event registrations');
  }

  // Calculate real_join_date and real_last_activity from events
  // This ensures correct engagement category for WhatsApp participants
  let realJoinDate = participantRecord.created_at;
  let realLastActivity = participantRecord.last_activity_at;
  
  if (eventsData.length > 0) {
    // Get earliest and latest event dates
    const sortedByDate = [...eventsData].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    const firstEventDate = new Date(sortedByDate[0].created_at);
    const lastEventDate = new Date(sortedByDate[sortedByDate.length - 1].created_at);
    const createdAt = participantRecord.created_at ? new Date(participantRecord.created_at) : null;
    const lastActivityAt = participantRecord.last_activity_at ? new Date(participantRecord.last_activity_at) : null;
    
    // real_join_date: earliest of first event or created_at
    if (!createdAt || firstEventDate < createdAt) {
      realJoinDate = firstEventDate.toISOString();
    }
    
    // real_last_activity: latest of last event or last_activity_at
    if (!lastActivityAt || lastEventDate > lastActivityAt) {
      realLastActivity = lastEventDate.toISOString();
    }
  }
  
  // Enrich participant record with real dates
  const enrichedParticipant = {
    ...participantRecord,
    real_join_date: realJoinDate,
    real_last_activity: realLastActivity
  } as ParticipantRecord;

  return {
    participant: enrichedParticipant,
    canonicalParticipantId: canonicalId,
    requestedParticipantId: participantId,
    duplicates: (duplicates || []) as ParticipantRecord[],
    traits: (traitsData || []) as ParticipantTrait[],
    groups,
    events: eventsData,
    eventRegistrations,
    externalIds,
    auditLog
  };
}
