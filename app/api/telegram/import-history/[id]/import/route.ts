import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramHistoryParser } from '@/lib/services/telegramHistoryParser';
import { TelegramJsonParser } from '@/lib/services/telegramJsonParser';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB for large group histories

interface ImportDecision {
  importName: string;
  importUsername?: string;
  importUserId?: number;
  action: 'merge' | 'create_new' | 'skip';
  targetParticipantId?: string;
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
    const expectedOrgId = requestUrl.searchParams.get('orgId')

    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const supabaseAdmin = createAdminServer();
    const numericGroupId = Number(groupId);
    const absGroupId = Math.abs(numericGroupId);
    
    const searchVariants = [
      { column: 'id', value: numericGroupId, enabled: !Number.isNaN(numericGroupId) },
      { column: 'id', value: groupId, enabled: true },
      { column: 'tg_chat_id', value: groupId, enabled: true },
      { column: 'tg_chat_id', value: numericGroupId, enabled: !Number.isNaN(numericGroupId) },
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
        const { data: orgLink } = await supabaseAdmin
          .from('org_telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', data.tg_chat_id)
          .maybeSingle();
        
        if (orgLink) {
          group = { ...data, org_telegram_groups: [orgLink] };
          break;
        }
      }

      if (error?.code !== 'PGRST116') {
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

    const orgTelegramGroups = (group as any).org_telegram_groups || [];
    
    let orgId: string | null = null;
    
    if (expectedOrgId) {
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
      orgId = orgTelegramGroups[0]?.org_id;
      if (!orgId) {
        return NextResponse.json({ error: 'Group not linked to organization' }, { status: 400 });
      }

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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const decisionsJson = formData.get('decisions') as string;

    if (!file || !decisionsJson) {
      return NextResponse.json({ error: 'Missing file or decisions' }, { status: 400 });
    }

    const decisions: ImportDecision[] = JSON.parse(decisionsJson);

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: 'File too large',
        message: `Размер файла превышает ${MAX_FILE_SIZE / 1024 / 1024}MB. Попробуйте экспортировать только текстовые сообщения (без медиа).`,
        maxSize: MAX_FILE_SIZE,
      }, { status: 400 });
    }

    const isJson = file.name.endsWith('.json') || file.type === 'application/json';
    const isHtml = file.name.endsWith('.html') || file.type === 'text/html';
    
    if (!isJson && !isHtml) {
      return NextResponse.json({
        error: 'Invalid file type',
        message: 'Пожалуйста, загрузите JSON или HTML файл экспорта Telegram'
      }, { status: 400 });
    }

    const fileContent = await file.text();
    let parsingResult: any;
    let authors: Map<string, any>;
    
    if (isJson) {
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
      const decisionsMap = new Map<string, ImportDecision>();
      decisions.forEach(d => {
        const key = d.importUserId 
          ? `user_${d.importUserId}` 
          : (d.importUsername || d.importName);
        decisionsMap.set(key, d);
      });

      const participantMap = new Map<string, string>();
      let newParticipantsCount = 0;

      for (const [authorKey, author] of Array.from(authors.entries())) {
        const decision = decisionsMap.get(authorKey);
        if (!decision) {
          logger.debug({ author_key: authorKey }, 'Skipping author without decision');
          continue;
        }

        if (decision.action === 'skip') {
          logger.debug({ author_key: authorKey }, 'Skipping author (skip action)');
          continue;
        }

        let participantId: string;

        if (decision.action === 'merge' && decision.targetParticipantId) {
          participantId = decision.targetParticipantId;
        } else {
          const nameParts = author.name.trim().split(/\s+/);
          const tgFirstName = nameParts[0] || author.name;
          const tgLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

          const { data: newParticipant, error: participantError } = await supabaseAdmin
            .from('participants')
            .insert({
              org_id: orgId,
              full_name: author.name,
              tg_first_name: tgFirstName,
              tg_last_name: tgLastName,
              username: author.username,
              tg_user_id: author.userId || null,
              source: 'import',
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

      // ──────────────────────────────────────────────────────────────
      // Pre-check: fetch existing message_ids to split new vs existing
      // ──────────────────────────────────────────────────────────────
      const existingMessageIdSet = new Set<number>();
      {
        let pgOffset = 0;
        const PG_SIZE = 5000;
        while (true) {
          const { data: page } = await supabaseAdmin
            .from('activity_events')
            .select('message_id')
            .eq('tg_chat_id', group.tg_chat_id)
            .eq('event_type', 'message')
            .not('message_id', 'is', null)
            .range(pgOffset, pgOffset + PG_SIZE - 1);
          if (!page || page.length === 0) break;
          page.forEach((r: any) => { if (r.message_id) existingMessageIdSet.add(r.message_id); });
          if (page.length < PG_SIZE) break;
          pgOffset += PG_SIZE;
        }
      }
      const previouslyImportedCount = existingMessageIdSet.size;
      logger.info({ previously_imported: previouslyImportedCount }, 'Pre-check: existing messages in DB');

      // ──────────────────────────────────────────────────────────────
      // Batch import loop
      // ──────────────────────────────────────────────────────────────
      const BATCH_SIZE = 500;
      let importedCount = 0;
      let alreadyInDbCount = 0;
      let skippedNoDecisionCount = 0;
      let messagesSavedCount = 0;
      let textsBackfilledCount = 0;

      for (let i = 0; i < parsingResult.messages.length; i += BATCH_SIZE) {
        const messageBatch = parsingResult.messages.slice(i, i + BATCH_SIZE);

        const result = await processBatch(
          supabaseAdmin, messageBatch, participantMap,
          orgId!, group.tg_chat_id, batchId, isJson,
          existingMessageIdSet, logger
        );

        importedCount += result.imported;
        alreadyInDbCount += result.alreadyInDb;
        skippedNoDecisionCount += result.skippedNoDecision;
        messagesSavedCount += result.textsSaved;
        textsBackfilledCount += result.textsBackfilled;

        await supabaseAdmin
          .from('telegram_import_batches')
          .update({ imported_messages: importedCount })
          .eq('id', batchId);
      }

      // Count total messages in DB after import
      const { count: totalMessagesInDb } = await supabaseAdmin
        .from('activity_events')
        .select('*', { count: 'exact', head: true })
        .eq('tg_chat_id', group.tg_chat_id)
        .eq('event_type', 'message');

      logger.info({
        imported_count: importedCount,
        already_in_db: alreadyInDbCount,
        skipped_no_decision: skippedNoDecisionCount,
        texts_saved: messagesSavedCount,
        texts_backfilled: textsBackfilledCount,
        total_in_db: totalMessagesInDb,
        previously_imported: previouslyImportedCount,
        batch_id: batchId
      }, 'Import completed');

      await recalculateGroupMetrics(supabaseAdmin, orgId, group.tg_chat_id, logger);

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
          alreadyInDb: alreadyInDbCount,
          skippedNoDecision: skippedNoDecisionCount,
          messagesSaved: messagesSavedCount,
          textsBackfilled: textsBackfilledCount,
          newParticipants: newParticipantsCount,
          matchedParticipants: decisions.filter(d => d.action === 'merge').length,
          totalMessagesInDb: totalMessagesInDb || 0,
          previouslyImported: previouslyImportedCount,
        },
      });
    } catch (error: any) {
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

// ──────────────────────────────────────────────────────────────
// Process a single batch of messages: split new vs existing,
// insert new events, backfill texts for already-imported ones.
// ──────────────────────────────────────────────────────────────
interface MappedEvent {
  event: Record<string, any>;
  fullText: string | null;
  participantId: string;
  tgUserId: number | null;
  messageId: number | null;
  timestamp: string;
}

async function processBatch(
  supabaseAdmin: ReturnType<typeof createAdminServer>,
  messageBatch: any[],
  participantMap: Map<string, string>,
  orgId: string,
  tgChatId: number,
  batchId: string,
  isJson: boolean,
  existingMessageIdSet: Set<number>,
  logger: ReturnType<typeof createAPILogger>
): Promise<{
  imported: number;
  alreadyInDb: number;
  skippedNoDecision: number;
  textsSaved: number;
  textsBackfilled: number;
}> {
  let imported = 0;
  let alreadyInDb = 0;
  let skippedNoDecision = 0;
  let textsSaved = 0;
  let textsBackfilled = 0;

  // Phase 1: Map messages to events
  const mapped: MappedEvent[] = [];

  for (const msg of messageBatch) {
    const authorKey = msg.authorUserId
      ? `user_${msg.authorUserId}`
      : (msg.authorUsername || msg.authorName);
    const participantId = participantMap.get(authorKey);

    if (!participantId) {
      skippedNoDecision++;
      continue;
    }

    const tgUserId = msg.authorUserId || null;
    const messageId = msg.messageId || null;
    const textPreview = msg.text ? msg.text.substring(0, 500) : '';

    const normalizedTimestamp = new Date(Date.UTC(
      msg.timestamp.getUTCFullYear(),
      msg.timestamp.getUTCMonth(),
      msg.timestamp.getUTCDate(),
      msg.timestamp.getUTCHours(),
      msg.timestamp.getUTCMinutes(),
      msg.timestamp.getUTCSeconds(),
      msg.timestamp.getUTCMilliseconds()
    ));

    const createdAt = normalizedTimestamp.toISOString();

    mapped.push({
      event: {
        org_id: orgId,
        event_type: 'message',
        tg_user_id: tgUserId,
        tg_chat_id: tgChatId,
        message_id: messageId,
        chars_count: msg.charCount,
        links_count: msg.linksCount,
        mentions_count: msg.mentionsCount,
        reply_to_message_id: (msg as any).replyToMessageId || null,
        has_media: false,
        created_at: createdAt,
        import_source: 'html_import',
        import_batch_id: batchId,
        meta: {
          user: { name: msg.authorName, username: msg.authorUsername || null, tg_user_id: tgUserId },
          message: {
            id: messageId, thread_id: null, reply_to_id: (msg as any).replyToMessageId || null,
            text_preview: textPreview, text_length: msg.text?.length || 0, has_media: false, media_type: null
          },
          source: { type: 'import', format: isJson ? 'json' : 'html', batch_id: batchId }
        }
      },
      fullText: msg.text || null,
      participantId,
      tgUserId,
      messageId,
      timestamp: createdAt
    });
  }

  if (mapped.length === 0) {
    return { imported, alreadyInDb, skippedNoDecision, textsSaved, textsBackfilled };
  }

  // Phase 2: Split into new and already-in-DB using pre-fetched set
  const newMapped: MappedEvent[] = [];
  const existingMapped: MappedEvent[] = [];

  for (const m of mapped) {
    if (m.messageId && existingMessageIdSet.has(m.messageId)) {
      existingMapped.push(m);
    } else {
      newMapped.push(m);
    }
  }

  alreadyInDb = existingMapped.length;

  // Phase 3: Insert truly new events
  if (newMapped.length > 0) {
    const newEvents = newMapped.map(m => m.event);

    const { data, error } = await supabaseAdmin
      .from('activity_events')
      .insert(newEvents)
      .select('id') as { data: any[] | null; error: any };

    if (error) {
      if (error.code === '23505') {
        alreadyInDb += newEvents.length;
        logger.warn({ batch_size: newEvents.length }, 'Concurrent duplicates detected');
      } else {
        throw error;
      }
    } else {
      imported = data?.length || 0;

      // Save texts for newly inserted events
      if (data && data.length > 0) {
        const pmData = data.map((row: any, idx: number) => {
          const m = newMapped[idx];
          if (!m.fullText || !row.id) return null;
          return buildParticipantMessage(orgId, tgChatId, row.id, m);
        }).filter((x: any): x is NonNullable<typeof x> => x !== null);

        if (pmData.length > 0) {
          const { data: saved } = await supabaseAdmin
            .from('participant_messages')
            .upsert(pmData, { onConflict: 'tg_chat_id,message_id', ignoreDuplicates: true })
            .select('id');
          textsSaved = saved?.length || 0;
        }
      }

      // Track newly inserted message_ids for subsequent batches
      newMapped.forEach(m => {
        if (m.messageId) existingMessageIdSet.add(m.messageId);
      });
    }
  }

  // Phase 4: Backfill texts for existing events (dosave participant_messages)
  if (existingMapped.length > 0) {
    const existingMsgIds = existingMapped
      .map(m => m.messageId)
      .filter((id): id is number => id !== null);

    if (existingMsgIds.length > 0) {
      const { data: existingRows } = await supabaseAdmin
        .from('activity_events')
        .select('id, message_id')
        .eq('tg_chat_id', tgChatId)
        .eq('event_type', 'message')
        .in('message_id', existingMsgIds);

      const aeIdMap = new Map<number, string>();
      (existingRows || []).forEach((r: any) => {
        if (r.message_id) aeIdMap.set(r.message_id, r.id);
      });

      const backfillData = existingMapped.map(m => {
        if (!m.fullText || !m.messageId) return null;
        const aeId = aeIdMap.get(m.messageId);
        if (!aeId) return null;
        return buildParticipantMessage(orgId, tgChatId, aeId, m);
      }).filter((x: any): x is NonNullable<typeof x> => x !== null);

      if (backfillData.length > 0) {
        const { data: saved } = await supabaseAdmin
          .from('participant_messages')
          .upsert(backfillData, { onConflict: 'tg_chat_id,message_id', ignoreDuplicates: true })
          .select('id');
        textsBackfilled = saved?.length || 0;
      }
    }
  }

  return { imported, alreadyInDb, skippedNoDecision, textsSaved, textsBackfilled };
}

function buildParticipantMessage(
  orgId: string,
  tgChatId: number,
  activityEventId: string,
  m: MappedEvent
) {
  if (!m.fullText) return null;
  return {
    org_id: orgId,
    participant_id: m.participantId,
    tg_user_id: m.tgUserId,
    tg_chat_id: tgChatId,
    activity_event_id: activityEventId,
    message_id: m.messageId,
    message_text: m.fullText,
    message_thread_id: null,
    reply_to_message_id: null,
    has_media: false,
    media_type: null,
    chars_count: m.fullText.length,
    words_count: m.fullText.trim().split(/\s+/).filter((w: string) => w.length > 0).length,
    sent_at: m.timestamp
  };
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

  const { count: memberCount } = await supabase
    .from('participant_groups')
    .select('*', { count: 'exact', head: true })
    .eq('tg_group_id', tgChatId)
    .is('left_at', null);

  const { data: lastActivity } = await supabase
    .from('activity_events')
    .select('created_at')
    .eq('tg_chat_id', tgChatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  await supabase
    .from('telegram_groups')
    .update({
      member_count: memberCount || 0,
      last_activity_at: lastActivity?.created_at,
    })
    .eq('tg_chat_id', tgChatId);

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
