import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramHistoryParser } from '@/lib/services/telegramHistoryParser';
import { TelegramJsonParser } from '@/lib/services/telegramJsonParser';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (increased for JSON files)

interface ImportDecision {
  importName: string;
  importUsername?: string;
  importUserId?: number; // ⭐ Telegram User ID из JSON
  action: 'merge' | 'create_new' | 'skip'; // ⭐ Добавлена опция "Игнорировать"
  targetParticipantId?: string; // Если merge
}

interface ImportRequest {
  file: File;
  decisions: ImportDecision[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'telegram/import-history/import' });
  
  let groupId: string | undefined;
  
  try {
    const paramsResolved = await params;
    groupId = paramsResolved.id;
    const requestUrl = new URL(request.url)
    const expectedOrgId = requestUrl.searchParams.get('orgId') // ✅ Получаем orgId из query параметров

    // Проверяем авторизацию через unified auth
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Если передан orgId, сначала проверяем доступ к организации
    if (expectedOrgId) {
      const supabaseAdmin = createAdminServer();
      const { data: membership } = await supabaseAdmin
        .from('memberships')
        .select('role')
        .eq('org_id', expectedOrgId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        logger.warn({ 
          user_id: user.id,
          org_id: expectedOrgId,
          membership_role: membership?.role || 'none'
        }, 'Access denied (pre-check)');
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    // Получаем группу и проверяем доступ
    // ⚠️ ID группы может быть отрицательным (после получения прав админа ботом)
    // или положительным (в JSON экспорте), поэтому ищем по обоим вариантам
    // Также groupId может быть как id (автоинкремент), так и tg_chat_id
    const supabaseAdmin = createAdminServer();
    const numericGroupId = Number(groupId);
    const absGroupId = Math.abs(numericGroupId);
    
    // Пробуем найти группу по разным вариантам (как в detail/route.ts)
    const searchVariants = [
      { column: 'id', value: numericGroupId, enabled: !Number.isNaN(numericGroupId) },
      { column: 'id', value: groupId, enabled: true },
      { column: 'tg_chat_id', value: groupId, enabled: true },
      { column: 'tg_chat_id', value: numericGroupId, enabled: !Number.isNaN(numericGroupId) },
      // Также пробуем по абсолютному значению для tg_chat_id (на случай изменения знака)
      { column: 'tg_chat_id', value: absGroupId, enabled: !Number.isNaN(numericGroupId) },
      { column: 'tg_chat_id', value: -absGroupId, enabled: !Number.isNaN(numericGroupId) },
    ];

    let group: any = null;
    let groupError: any = null;

    for (const variant of searchVariants) {
      if (!variant.enabled) continue;

      const { data, error } = await supabaseAdmin
        .from('telegram_groups')
        .select('*')
        .eq(variant.column, variant.value)
        .maybeSingle();

      if (data) {
        // Проверяем что группа привязана к организации
        const { data: orgLink } = await supabaseAdmin
          .from('org_telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', data.tg_chat_id)
          .maybeSingle();
        
        if (orgLink) {
          group = { ...data, org_telegram_groups: orgLink };
          break;
        }
      }

      if (error?.code !== 'PGRST116') { // not-a-single-row error from maybeSingle
        groupError = error;
      }
    }

    if (groupError && !group) {
      logger.error({ 
        group_id: groupId,
        error: groupError.message
      }, 'Group fetch error');
    }

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // ✅ Получаем все организации, связанные с группой
    const orgTelegramGroups = (group as any).org_telegram_groups || [];
    
    // ✅ Если передан expectedOrgId, используем его (уже проверили доступ выше)
    // Иначе берем первую организацию и проверяем доступ
    let orgId: string | null = null;
    
    if (expectedOrgId) {
      // Проверяем, что группа действительно связана с ожидаемой организацией
      const orgLink = orgTelegramGroups.find((link: any) => link.org_id === expectedOrgId);
      if (orgLink) {
        orgId = expectedOrgId;
      } else {
        return NextResponse.json({ 
          error: 'Group not linked to specified organization',
          message: 'Группа не связана с указанной организацией'
        }, { status: 400 });
      }
    } else {
      // Если orgId не передан, берем первую организацию и проверяем доступ
      orgId = orgTelegramGroups[0]?.org_id;
      if (!orgId) {
        return NextResponse.json({ error: 'Group not linked to organization' }, { status: 400 });
      }

      // Проверяем права пользователя в организации
      const { data: membership } = await supabaseAdmin
        .from('memberships')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        logger.warn({ 
          user_id: user.id,
          org_id: orgId,
          membership_role: membership?.role || 'none'
        }, 'Access denied');
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    // Получаем данные из FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const decisionsJson = formData.get('decisions') as string;

    if (!file || !decisionsJson) {
      return NextResponse.json({ error: 'Missing file or decisions' }, { status: 400 });
    }

    const decisions: ImportDecision[] = JSON.parse(decisionsJson);

    // Проверяем размер файла
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Определяем формат файла
    const isJson = file.name.endsWith('.json') || file.type === 'application/json';
    const isHtml = file.name.endsWith('.html') || file.type === 'text/html';
    
    if (!isJson && !isHtml) {
      return NextResponse.json({
        error: 'Invalid file type',
        message: 'Пожалуйста, загрузите JSON или HTML файл экспорта Telegram'
      }, { status: 400 });
    }

    // Читаем и парсим файл
    const fileContent = await file.text();
    let parsingResult: any;
    let authors: Map<string, any>;
    
    if (isJson) {
      // Parse JSON format
      const validation = TelegramJsonParser.validate(fileContent);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      parsingResult = TelegramJsonParser.parse(fileContent);
      authors = parsingResult.authors;
      logger.info({ 
        format: 'json',
        total_messages: parsingResult.stats.totalMessages,
        decisions_count: decisions.length,
        group_id: groupId
      }, 'Importing from JSON');
    } else {
      // Parse HTML format
      const validation = TelegramHistoryParser.validate(fileContent);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      parsingResult = TelegramHistoryParser.parse(fileContent);
      authors = parsingResult.authors;
      logger.info({ 
        format: 'html',
        total_messages: parsingResult.stats.totalMessages,
        decisions_count: decisions.length,
        group_id: groupId
      }, 'Importing from HTML');
    }

    // Создаем батч импорта
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('telegram_import_batches')
      .insert({
        org_id: orgId,
        tg_chat_id: group.tg_chat_id,
        filename: file.name,
        file_size: file.size,
        total_messages: parsingResult.stats.totalMessages,
        date_range_start: parsingResult.dateRange.start,
        date_range_end: parsingResult.dateRange.end,
        status: 'importing',
        imported_by: user.id,
      })
      .select('id')
      .single();

    if (batchError || !batch) {
      logger.error({ 
        group_id: groupId,
        org_id: orgId,
        error: batchError?.message
      }, 'Error creating import batch');
      return NextResponse.json({ error: 'Failed to create import batch' }, { status: 500 });
    }

    const batchId = batch.id;

    try {
      // Создаем мапу решений
      const decisionsMap = new Map<string, ImportDecision>();
      decisions.forEach(d => {
        // ⭐ Используем ту же логику ключа, что и в UI
        const key = d.importUserId 
          ? `user_${d.importUserId}` 
          : (d.importUsername || d.importName);
        decisionsMap.set(key, d);
      });

      // Создаем мапу участников (имя -> participant_id)
      const participantMap = new Map<string, string>();

      let newParticipantsCount = 0;

      // Обрабатываем каждого автора
      for (const [authorKey, author] of Array.from(authors.entries())) {
        const decision = decisionsMap.get(authorKey);
        if (!decision) {
          // Author was filtered out (bot) or not included in decisions - skip silently
          logger.debug({ author_key: authorKey }, 'Skipping author without decision');
          continue;
        }

        // ⭐ Пропускаем, если выбрано "Игнорировать"
        if (decision.action === 'skip') {
          logger.debug({ author_key: authorKey }, 'Skipping author (skip action)');
          continue;
        }

        let participantId: string;

        if (decision.action === 'merge' && decision.targetParticipantId) {
          // Используем существующего участника
          participantId = decision.targetParticipantId;
        } else {
          // Создаем нового участника
          // Пытаемся разбить имя на first_name и last_name
          const nameParts = author.name.trim().split(/\s+/);
          const tgFirstName = nameParts[0] || author.name;
          const tgLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

          const { data: newParticipant, error: participantError } = await supabaseAdmin
            .from('participants')
            .insert({
              org_id: orgId,
              full_name: author.name,
              tg_first_name: tgFirstName, // Telegram имя (из импорта)
              tg_last_name: tgLastName, // Telegram фамилия (из импорта)
              username: author.username,
              tg_user_id: author.userId || null, // ⭐ Сохраняем Telegram User ID если есть (из JSON)
              source: 'import', // Общий источник для всех импортов
              created_at: author.firstMessageDate,
              last_activity_at: author.lastMessageDate,
            })
            .select('id')
            .single();

          if (participantError || !newParticipant) {
            logger.error({ 
              author_name: author.name,
              author_key: authorKey,
              org_id: orgId,
              error: participantError?.message
            }, 'Failed to create participant');
            continue;
          }

          participantId = newParticipant.id;
          newParticipantsCount++;
        }

        // ⭐ ВАЖНО: Создаем связь с группой для ВСЕХ участников (и новых, и существующих)
        // Это позволяет добавить в эту группу участников, которые уже есть в других группах организации
        await supabaseAdmin
          .from('participant_groups')
          .upsert({
            participant_id: participantId,
            tg_group_id: group.tg_chat_id,
            joined_at: author.firstMessageDate,
            is_active: true,
          }, {
            onConflict: 'participant_id,tg_group_id',
          });

        participantMap.set(authorKey, participantId);
      }

      logger.info({ 
        new_participants_count: newParticipantsCount,
        org_id: orgId
      }, 'Created new participants');

      // Импортируем сообщения батчами по 500
      const BATCH_SIZE = 500;
      let importedCount = 0;
      let skippedCount = 0;
      let duplicateCount = 0;
      let messagesSavedCount = 0;
      let messagesSkippedCount = 0;

      for (let i = 0; i < parsingResult.messages.length; i += BATCH_SIZE) {
        const messageBatch = parsingResult.messages.slice(i, i + BATCH_SIZE);

        const activityEvents = messageBatch
          .map((msg: any) => {
            // ⭐ Используем ту же логику ключа, что и в парсере
            const authorKey = msg.authorUserId 
              ? `user_${msg.authorUserId}` 
              : (msg.authorUsername || msg.authorName);
            const participantId = participantMap.get(authorKey);

            if (!participantId) {
              skippedCount++;
              return null;
            }

            // Unified metadata structure (same as webhook)
            const textPreview = msg.text ? msg.text.substring(0, 500) : ''; // First 500 chars
            const tgUserId = (msg as any).authorUserId || null;
            const messageId = (msg as any).messageId || null;
            
            // Normalize timestamp to UTC to avoid timezone-related duplicates
            // Store original timestamp for debugging
            const originalTimestamp = msg.timestamp;
            const normalizedTimestamp = new Date(Date.UTC(
              msg.timestamp.getUTCFullYear(),
              msg.timestamp.getUTCMonth(),
              msg.timestamp.getUTCDate(),
              msg.timestamp.getUTCHours(),
              msg.timestamp.getUTCMinutes(),
              msg.timestamp.getUTCSeconds(),
              msg.timestamp.getUTCMilliseconds()
            ));
            
            return {
              org_id: orgId,
              event_type: 'message',
              tg_user_id: tgUserId,
              tg_chat_id: group.tg_chat_id,
              message_id: messageId,
              chars_count: msg.charCount,
              links_count: msg.linksCount,
              mentions_count: msg.mentionsCount,
              reply_to_message_id: (msg as any).replyToMessageId || null,
              has_media: false, // TODO: detect media from parsed data
              created_at: normalizedTimestamp.toISOString(),
              import_source: 'html_import', // Используем 'html_import' для любых файловых импортов (JSON/HTML)
              import_batch_id: batchId,
              meta: {
                user: {
                  name: msg.authorName,
                  username: msg.authorUsername || null,
                  tg_user_id: tgUserId
                },
                message: {
                  id: messageId,
                  thread_id: null,
                  reply_to_id: (msg as any).replyToMessageId || null,
                  text_preview: textPreview,
                  text_length: msg.text?.length || 0,
                  has_media: false, // TODO: detect from parsed data
                  media_type: null
                },
                source: {
                  type: 'import',
                  format: isJson ? 'json' : 'html',
                  batch_id: batchId
                }
              },
              // ⭐ Store full text and participant_id for participant_messages insert
              _fullText: msg.text,
              _participantId: participantId,
              // Store original timestamp for debugging timezone issues
              _originalTimestamp: originalTimestamp.toISOString()
            };
          })
          .filter((e: any): e is NonNullable<typeof e> => e !== null);

        if (activityEvents.length > 0) {
          logger.debug({ 
            batch_size: activityEvents.length,
            batch_index: Math.floor(i / BATCH_SIZE) + 1
          }, 'Attempting to insert activity events');
          
          // Store full texts and participant IDs before insert (they're not DB columns)
          const messageTextsMap = new Map<number, { text: string; participantId: string; tgUserId: number | null; messageId: number | null; timestamp: string }>();
          activityEvents.forEach((event: any, idx: number) => {
            if (event._fullText) {
              messageTextsMap.set(idx, {
                text: event._fullText,
                participantId: event._participantId,
                tgUserId: event.tg_user_id,
                messageId: event.message_id,
                timestamp: event.created_at
              });
            }
            // Remove temporary fields before DB insert
            delete event._fullText;
            delete event._participantId;
          });
          
          // Log first event with timezone info for debugging
          if (activityEvents.length > 0) {
            const firstEvent = activityEvents[0];
            const timezoneDebug = {
              originalTimestamp: firstEvent._originalTimestamp,
              normalizedTimestamp: firstEvent.created_at,
              timeDifference: firstEvent._originalTimestamp !== firstEvent.created_at ? 
                `${Math.abs(new Date(firstEvent.created_at).getTime() - new Date(firstEvent._originalTimestamp).getTime()) / 1000 / 60} minutes` : 
                'none'
            };
            
            // Remove debug fields before logging
            const { _originalTimestamp, ...eventForLog } = firstEvent;
            
            logger.debug({ 
              first_event: {
                ...eventForLog,
                _timezoneDebug: timezoneDebug
              }
            }, 'First event sample');
            
            // Remove debug field before DB insert
            activityEvents.forEach((event: any) => {
              delete event._originalTimestamp;
            });
          }
          
          const { data, error: insertError } = await supabaseAdmin
            .from('activity_events')
            .insert(activityEvents as any)
            .select('id') as { data: any[] | null; error: any };

          logger.debug({ 
            inserted_count: data?.length || 0,
            attempted_count: activityEvents.length,
            has_error: !!insertError
          }, 'Insert result');
          
          if (insertError) {
            logger.error({ 
              batch_size: activityEvents.length,
              error: insertError.message,
              code: insertError.code
            }, 'Error inserting activity events');
            // Проверяем дубликаты
            if (insertError.code === '23505') {
              logger.warn({ batch_size: activityEvents.length }, 'Some messages were duplicates, attempting to find existing records');
              
              // Try to find existing records for duplicate messages
              // Query all potential duplicates in one batch query
              const existingEventsMap = new Map<string, any>();
              
              // Build a query to find all existing events matching our batch
              // Use message_id for precise matching (more reliable than composite key)
              const chatId = group.tg_chat_id;
              const messageIds = activityEvents
                .map((e: any) => e.message_id)
                .filter((id: any): id is number => id !== null && id !== undefined);
              
              // Query existing events by message_id (most precise match)
              const { data: existingEvents, error: findError } = await supabaseAdmin
                .from('activity_events')
                .select('id, tg_chat_id, tg_user_id, created_at, chars_count, message_id')
                .eq('tg_chat_id', chatId)
                .in('message_id', messageIds.length > 0 ? messageIds : [-1]) // Use -1 if empty to avoid SQL error
                .eq('event_type', 'message')
                .eq('import_source', 'html_import');
              
              if (!findError && existingEvents) {
                // Build map by message_id (most precise)
                existingEvents.forEach((existing: any) => {
                  if (existing.message_id) {
                    existingEventsMap.set(existing.message_id.toString(), existing);
                  }
                });
              }
              
              logger.debug({ 
                existing_count: existingEventsMap.size,
                attempted_count: activityEvents.length
              }, 'Found existing records by message_id');
              
              // Match existing events with our activity events
              // First by message_id (most precise), then by composite key for unmatched events
              const matchedEvents: any[] = [];
              const unmatchedEvents: Array<{ event: any; idx: number }> = [];
              
              // Step 1: Match by message_id
              activityEvents.forEach((event: any, idx: number) => {
                if (event.message_id) {
                  const existing = existingEventsMap.get(event.message_id.toString());
                  if (existing) {
                    // Confirmed duplicate - found in DB by message_id
                    matchedEvents.push({ ...existing, _originalIndex: idx });
                  } else {
                    // Event with message_id but not found - check composite key
                    unmatchedEvents.push({ event, idx });
                  }
                } else {
                  // Event without message_id - check composite key
                  unmatchedEvents.push({ event, idx });
                }
              });
              
              // Step 2: For unmatched events, check by composite key (tg_chat_id, tg_user_id, created_at, chars_count)
              // This matches the unique index idx_activity_dedup_imported
              if (unmatchedEvents.length > 0) {
                const compositeKeyQueries = unmatchedEvents.map(async ({ event, idx }) => {
                  if (!event.tg_user_id || !event.created_at || event.chars_count === undefined) {
                    return null; // Cannot check composite key without required fields
                  }
                  
                  const { data: existing, error } = await supabaseAdmin
                    .from('activity_events')
                    .select('id, tg_chat_id, tg_user_id, created_at, chars_count, message_id')
                    .eq('tg_chat_id', event.tg_chat_id)
                    .eq('tg_user_id', event.tg_user_id)
                    .eq('created_at', event.created_at)
                    .eq('chars_count', event.chars_count)
                    .eq('event_type', 'message')
                    .eq('import_source', 'html_import')
                    .maybeSingle();
                  
                  if (!error && existing) {
                    return { existing, idx };
                  }
                  return null;
                });
                
                const compositeMatches = await Promise.all(compositeKeyQueries);
                compositeMatches.forEach((match) => {
                  if (match) {
                    matchedEvents.push({ ...match.existing, _originalIndex: match.idx });
                  }
                });
              }
              
              const confirmedDuplicates = matchedEvents.length;
              const unconfirmedCount = activityEvents.length - confirmedDuplicates;
              
              logger.info({ 
                confirmed_duplicates: confirmedDuplicates,
                unconfirmed: unconfirmedCount,
                total_in_batch: activityEvents.length
              }, 'Duplicate batch analysis');
              
              // Only count confirmed duplicates (found in DB) as duplicates
              duplicateCount += confirmedDuplicates;
              
              // Events not found in DB are skipped (cannot confirm if they're duplicates)
              // They failed to insert but we couldn't find existing records to confirm
              skippedCount += unconfirmedCount;
              
              // DO NOT increment importedCount - none were newly imported
              // (either confirmed duplicates or unconfirmed, but all failed to insert)
              
              // Try to save message texts for existing events
              if (matchedEvents.length > 0) {
                const participantMessagesData = matchedEvents
                  .map((existingEvent: any) => {
                    const messageData = messageTextsMap.get(existingEvent._originalIndex);
                    if (!messageData || !messageData.text || !existingEvent.id) return null;
                    
                    const wordsCount = messageData.text.trim().split(/\s+/).filter(w => w.length > 0).length;
                    
                    return {
                      org_id: orgId,
                      participant_id: messageData.participantId,
                      tg_user_id: messageData.tgUserId,
                      tg_chat_id: group.tg_chat_id,
                      activity_event_id: existingEvent.id,
                      message_id: messageData.messageId,
                      message_text: messageData.text,
                      message_thread_id: null,
                      reply_to_message_id: null,
                      has_media: false,
                      media_type: null,
                      chars_count: messageData.text.length,
                      words_count: wordsCount,
                      sent_at: messageData.timestamp
                    };
                  })
                  .filter((m: any): m is NonNullable<typeof m> => m !== null);
                
                if (participantMessagesData.length > 0) {
                  logger.debug({ 
                    messages_count: participantMessagesData.length
                  }, 'Attempting to save message texts for existing events');
                  
                  const { data: savedMessages, error: messagesError } = await supabaseAdmin
                    .from('participant_messages')
                    .upsert(participantMessagesData, {
                      onConflict: 'tg_chat_id,message_id',
                      ignoreDuplicates: true
                    })
                    .select('id');
                  
                  if (messagesError) {
                    logger.warn({ 
                      error: messagesError.message,
                      messages_count: participantMessagesData.length
                    }, 'Failed to save message texts for existing events');
                  } else {
                    const savedCount = savedMessages?.length || 0;
                    const skippedMessagesCount = participantMessagesData.length - savedCount;
                    messagesSavedCount += savedCount;
                    messagesSkippedCount += skippedMessagesCount;
                    logger.info({ 
                      saved_count: savedCount,
                      skipped_count: skippedMessagesCount
                    }, 'Saved message texts for existing events');
                  }
                }
              }
            } else {
              throw insertError;
            }
          } else {
            const insertedCount = data?.length || 0;
            logger.info({ 
              inserted_count: insertedCount,
              attempted_count: activityEvents.length
            }, 'Successfully inserted activity events');
            importedCount += insertedCount;
            
            // Phase 2: Save full message texts to participant_messages
            if (data && data.length > 0) {
              const participantMessagesData = data
                .map((insertedEvent: any, idx: number) => {
                  const messageData = messageTextsMap.get(idx);
                  if (!messageData || !messageData.text || !insertedEvent.id) return null;
                  
                  const wordsCount = messageData.text.trim().split(/\s+/).filter(w => w.length > 0).length;
                  
                  return {
                    org_id: orgId,
                    participant_id: messageData.participantId,
                    tg_user_id: messageData.tgUserId,
                    tg_chat_id: group.tg_chat_id,
                    activity_event_id: insertedEvent.id,
                    message_id: messageData.messageId,
                    message_text: messageData.text, // ✅ Full text
                    message_thread_id: null,
                    reply_to_message_id: null, // TODO: extract from parsed data
                    has_media: false, // TODO: detect from parsed data
                    media_type: null,
                    chars_count: messageData.text.length,
                    words_count: wordsCount,
                    sent_at: messageData.timestamp // Original message timestamp
                  };
                })
                .filter((m: any): m is NonNullable<typeof m> => m !== null);
              
              if (participantMessagesData.length > 0) {
                logger.debug({ 
                  messages_count: participantMessagesData.length
                }, 'Saving message texts to participant_messages');
                
                const { data: savedMessages, error: messagesError } = await supabaseAdmin
                  .from('participant_messages')
                  .upsert(participantMessagesData, {
                    onConflict: 'tg_chat_id,message_id',
                    ignoreDuplicates: true
                  })
                  .select('id');
                
                if (messagesError) {
                  logger.warn({ 
                    error: messagesError.message,
                    messages_count: participantMessagesData.length
                  }, 'Failed to save message texts');
                  // Non-critical error, continue
                } else {
                  const savedCount = savedMessages?.length || 0;
                  const skippedMessagesCount = participantMessagesData.length - savedCount;
                  messagesSavedCount += savedCount;
                  messagesSkippedCount += skippedMessagesCount;
                  logger.info({ 
                    saved_count: savedCount,
                    skipped_count: skippedMessagesCount
                  }, 'Saved message texts');
                }
              }
            }
            
            if (insertedCount === 0 && activityEvents.length > 0) {
              logger.warn({ 
                attempted_count: activityEvents.length
              }, 'Tried to insert events but got 0 back');
            }
            
            // 🔍 ДИАГНОСТИКА: Проверяем, действительно ли записи в БД
            if (insertedCount > 0) {
              const { data: checkData, error: checkError } = await supabaseAdmin
                .from('activity_events')
                .select('id, tg_chat_id, org_id, event_type, tg_user_id, created_at')
                .eq('import_batch_id', batchId)
                .limit(3);
              
              logger.debug({ 
                batch_id: batchId,
                found_count: checkData?.length || 0
              }, 'Verification check');
              
              if (checkData && checkData.length > 0) {
                logger.debug({ sample_record: checkData[0] }, 'Sample record');
              } else {
                logger.error({ batch_id: batchId }, 'CRITICAL: Records were inserted but cannot be found by batch_id');
              }
              
              if (checkError) {
                logger.error({ 
                  batch_id: batchId,
                  error: checkError.message
                }, 'Error checking records');
              }
            }
          }
        }

        // Обновляем прогресс в batch
        await supabaseAdmin
          .from('telegram_import_batches')
          .update({
            imported_messages: importedCount,
          })
          .eq('id', batchId);
      }

      logger.info({ 
        imported_count: importedCount,
        skipped_count: skippedCount,
        duplicate_count: duplicateCount,
        messages_saved: messagesSavedCount,
        messages_skipped: messagesSkippedCount,
        batch_id: batchId
      }, 'Import completed');

      // Пересчитываем метрики группы
      await recalculateGroupMetrics(supabaseAdmin, orgId, group.tg_chat_id, logger);

      // Обновляем статус батча
      await supabaseAdmin
        .from('telegram_import_batches')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          imported_messages: importedCount,
          new_participants: newParticipantsCount,
          matched_participants: decisions.filter(d => d.action === 'merge').length,
        })
        .eq('id', batchId);

      // Log admin action
      await logAdminAction({
        orgId: orgId!,
        userId: user.id,
        action: AdminActions.IMPORT_TELEGRAM_HISTORY,
        resourceType: ResourceTypes.IMPORT,
        resourceId: batchId.toString(),
        metadata: {
          group_id: groupId,
          group_title: group.title,
          filename: file.name,
          imported_messages: importedCount,
          new_participants: newParticipantsCount,
          format: isJson ? 'json' : 'html'
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          batchId,
          importedMessages: importedCount,
          skippedMessages: skippedCount,
          duplicateMessages: duplicateCount,
          messagesSaved: messagesSavedCount,
          messagesSkipped: messagesSkippedCount,
          newParticipants: newParticipantsCount,
          matchedParticipants: decisions.filter(d => d.action === 'merge').length,
        },
      });
    } catch (error: any) {
      // Помечаем батч как failed
      await supabaseAdmin
        .from('telegram_import_batches')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      throw error;
    }
  } catch (error: any) {
    logger.error({ 
      group_id: groupId || 'unknown',
      error: error.message || String(error),
      stack: error.stack
    }, 'Error importing Telegram history');
    return NextResponse.json({
      error: 'Import failed',
      message: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Пересчитывает метрики группы после импорта
 */
async function recalculateGroupMetrics(
  supabase: any,
  orgId: string,
  tgChatId: number,
  logger: ReturnType<typeof createAPILogger>
) {
  logger.debug({ org_id: orgId, chat_id: tgChatId }, 'Recalculating group metrics');

  // 1. Обновляем member_count
  const { count: memberCount } = await supabase
    .from('participant_groups')
    .select('*', { count: 'exact', head: true })
    .eq('tg_group_id', tgChatId)
    .eq('is_active', true);

  // 2. Получаем дату последней активности
  const { data: lastActivity } = await supabase
    .from('activity_events')
    .select('created_at')
    .eq('tg_chat_id', tgChatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // 3. Обновляем группу
  await supabase
    .from('telegram_groups')
    .update({
      member_count: memberCount || 0,
      last_activity_at: lastActivity?.created_at,
    })
    .eq('tg_chat_id', tgChatId);

  // 4. Обновляем last_activity_at для всех участников
  const { data: participants } = await supabase
    .from('participants')
    .select('id')
    .eq('org_id', orgId);

  if (participants) {
    for (const participant of participants) {
      const { data: lastParticipantActivity } = await supabase
        .from('activity_events')
        .select('created_at')
        .eq('participant_id', participant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastParticipantActivity) {
        await supabase
          .from('participants')
          .update({
            last_activity_at: lastParticipantActivity.created_at,
          })
          .eq('id', participant.id);
      }
    }
  }

  logger.debug({ org_id: orgId, chat_id: tgChatId }, 'Group metrics recalculated');
}

