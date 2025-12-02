import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramHistoryParser } from '@/lib/services/telegramHistoryParser';
import { TelegramJsonParser } from '@/lib/services/telegramJsonParser';

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
  { params }: { params: { id: string } }
) {
  try {
    const groupId = params.id;

    // Проверяем авторизацию
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        .select('*, org_telegram_groups!inner(org_id)')
        .eq(variant.column, variant.value)
        .maybeSingle();

      if (data) {
        group = data;
        break;
      }

      if (error?.code !== 'PGRST116') { // not-a-single-row error from maybeSingle
        groupError = error;
      }
    }

    if (groupError && !group) {
      console.error('Group fetch error:', groupError);
    }

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const orgId = (group as any).org_telegram_groups?.[0]?.org_id;
    if (!orgId) {
      return NextResponse.json({ error: 'Group not linked to organization' }, { status: 400 });
    }

    // Проверяем права пользователя
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
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
      console.log(`✅ Importing from JSON: ${parsingResult.stats.totalMessages} messages, ${decisions.length} decisions`);
    } else {
      // Parse HTML format
      const validation = TelegramHistoryParser.validate(fileContent);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      parsingResult = TelegramHistoryParser.parse(fileContent);
      authors = parsingResult.authors;
      console.log(`⚠️ Importing from HTML: ${parsingResult.stats.totalMessages} messages, ${decisions.length} decisions`);
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
      console.error('Error creating import batch:', batchError);
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
          console.warn(`No decision for author: ${authorKey}`);
          continue;
        }

        // ⭐ Пропускаем, если выбрано "Игнорировать"
        if (decision.action === 'skip') {
          console.log(`Skipping author: ${authorKey}`);
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
            console.error(`Failed to create participant ${author.name}:`, participantError);
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

      console.log(`Created ${newParticipantsCount} new participants`);

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
          console.log(`📝 Attempting to insert ${activityEvents.length} activity events...`);
          
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
            
            console.log(`📝 First event sample:`, JSON.stringify({
              ...eventForLog,
              _timezoneDebug: timezoneDebug
            }, null, 2));
            
            // Remove debug field before DB insert
            activityEvents.forEach((event: any) => {
              delete event._originalTimestamp;
            });
          }
          
          const { data, error: insertError } = await supabaseAdmin
            .from('activity_events')
            .insert(activityEvents as any)
            .select('id') as { data: any[] | null; error: any };

          console.log(`📝 Insert result: data=${data?.length || 0} records, error=${insertError ? 'YES' : 'NO'}`);
          
          if (insertError) {
            console.error('❌ Error inserting activity events:', insertError);
            // Проверяем дубликаты
            if (insertError.code === '23505') {
              console.warn('⚠️ Some messages were duplicates, attempting to find existing records...');
              
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
              
              console.log(`🔍 Found ${existingEventsMap.size} existing records by message_id out of ${activityEvents.length} attempted`);
              
              // Match existing events with our activity events by message_id
              const matchedEvents: any[] = [];
              activityEvents.forEach((event: any, idx: number) => {
                if (event.message_id) {
                  const existing = existingEventsMap.get(event.message_id.toString());
                  if (existing) {
                    matchedEvents.push({ ...existing, _originalIndex: idx });
                  }
                }
              });
              
              const insertedCount = matchedEvents.length;
              const duplicateBatch = activityEvents.length - insertedCount;
              
              console.log(`📊 Duplicate batch: ${insertedCount} found existing, ${duplicateBatch} new duplicates`);
              
              skippedCount += duplicateBatch;
              duplicateCount += duplicateBatch;
              importedCount += insertedCount;
              
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
                  console.log(`📝 Attempting to save ${participantMessagesData.length} message texts for existing events...`);
                  
                  const { data: savedMessages, error: messagesError } = await supabaseAdmin
                    .from('participant_messages')
                    .upsert(participantMessagesData, {
                      onConflict: 'tg_chat_id,message_id',
                      ignoreDuplicates: true
                    })
                    .select('id');
                  
                  if (messagesError) {
                    console.error('⚠️  Failed to save message texts for existing events:', messagesError);
                  } else {
                    const savedCount = savedMessages?.length || 0;
                    const skippedMessagesCount = participantMessagesData.length - savedCount;
                    messagesSavedCount += savedCount;
                    messagesSkippedCount += skippedMessagesCount;
                    console.log(`✅ Saved ${savedCount} message texts for existing events, skipped ${skippedMessagesCount} duplicates`);
                  }
                }
              }
            } else {
              throw insertError;
            }
          } else {
            const insertedCount = data?.length || 0;
            console.log(`✅ Successfully inserted ${insertedCount} activity events`);
            console.log(`✅ Inserted IDs:`, data?.map(d => d.id).join(', '));
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
                console.log(`📝 Saving ${participantMessagesData.length} message texts to participant_messages...`);
                
                const { data: savedMessages, error: messagesError } = await supabaseAdmin
                  .from('participant_messages')
                  .upsert(participantMessagesData, {
                    onConflict: 'tg_chat_id,message_id',
                    ignoreDuplicates: true
                  })
                  .select('id');
                
                if (messagesError) {
                  console.error('⚠️  Failed to save message texts:', messagesError);
                  // Non-critical error, continue
                } else {
                  const savedCount = savedMessages?.length || 0;
                  const skippedMessagesCount = participantMessagesData.length - savedCount;
                  messagesSavedCount += savedCount;
                  messagesSkippedCount += skippedMessagesCount;
                  console.log(`✅ Saved ${savedCount} message texts, skipped ${skippedMessagesCount} duplicates`);
                }
              }
            }
            
            if (insertedCount === 0 && activityEvents.length > 0) {
              console.warn(`⚠️ WARNING: Tried to insert ${activityEvents.length} events but got 0 back!`);
            }
            
            // 🔍 ДИАГНОСТИКА: Проверяем, действительно ли записи в БД
            if (insertedCount > 0) {
              const { data: checkData, error: checkError } = await supabaseAdmin
                .from('activity_events')
                .select('id, tg_chat_id, org_id, event_type, tg_user_id, created_at')
                .eq('import_batch_id', batchId)
                .limit(3);
              
              console.log(`🔍 Verification check - found ${checkData?.length || 0} records with batch_id=${batchId}`);
              if (checkData && checkData.length > 0) {
                console.log(`🔍 Sample record:`, JSON.stringify(checkData[0], null, 2));
              } else {
                console.error(`❌ CRITICAL: Records were inserted but cannot be found by batch_id!`);
              }
              
              if (checkError) {
                console.error(`❌ Error checking records:`, checkError);
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

      console.log(`Import completed: ${importedCount} imported, ${skippedCount} skipped (${duplicateCount} duplicates)`);
      console.log(`Messages saved: ${messagesSavedCount} saved, ${messagesSkippedCount} skipped (duplicates)`);

      // Пересчитываем метрики группы
      await recalculateGroupMetrics(supabaseAdmin, orgId, group.tg_chat_id);

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
    console.error('Error importing Telegram history:', error);
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
  tgChatId: number
) {
  console.log('Recalculating group metrics...');

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

  console.log('Group metrics recalculated');
}

