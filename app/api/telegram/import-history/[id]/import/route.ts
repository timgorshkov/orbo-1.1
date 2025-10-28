import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramHistoryParser } from '@/lib/services/telegramHistoryParser';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

interface ImportDecision {
  importName: string;
  importUsername?: string;
  action: 'merge' | 'create_new';
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
    const supabaseAdmin = createAdminServer();
    const { data: group, error: groupError } = await supabaseAdmin
      .from('telegram_groups')
      .select('*, org_telegram_groups!inner(org_id)')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
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

    // Читаем и парсим файл
    const htmlContent = await file.text();
    const validation = TelegramHistoryParser.validate(htmlContent);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const parsingResult = TelegramHistoryParser.parse(htmlContent);

    console.log(`Starting import: ${parsingResult.stats.totalMessages} messages, ${decisions.length} decisions`);

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
        const key = d.importUsername || d.importName;
        decisionsMap.set(key, d);
      });

      // Создаем мапу участников (имя -> participant_id)
      const participantMap = new Map<string, string>();

      let newParticipantsCount = 0;

      // Обрабатываем каждого автора
      for (const [authorKey, author] of Array.from(parsingResult.authors.entries())) {
        const decision = decisionsMap.get(authorKey);
        if (!decision) {
          console.warn(`No decision for author: ${authorKey}`);
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
              tg_user_id: null,
              source: 'html_import',
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

          // Создаем связь с группой
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
        }

        participantMap.set(authorKey, participantId);
      }

      console.log(`Created ${newParticipantsCount} new participants`);

      // Импортируем сообщения батчами по 500
      const BATCH_SIZE = 500;
      let importedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < parsingResult.messages.length; i += BATCH_SIZE) {
        const messageBatch = parsingResult.messages.slice(i, i + BATCH_SIZE);

        const activityEvents = messageBatch
          .map(msg => {
            const authorKey = msg.authorUsername || msg.authorName;
            const participantId = participantMap.get(authorKey);

            if (!participantId) {
              skippedCount++;
              return null;
            }

            return {
              org_id: orgId,
              event_type: 'message',
              participant_id: participantId,
              tg_user_id: null, // Нет ID из HTML
              tg_chat_id: group.tg_chat_id,
              message_id: null,
              chars_count: msg.charCount,
              links_count: msg.linksCount,
              mentions_count: msg.mentionsCount,
              created_at: msg.timestamp.toISOString(),
              import_source: 'html_import',
              import_batch_id: batchId,
              meta: {
                author_name: msg.authorName,
                author_username: msg.authorUsername,
                text_preview: msg.text.substring(0, 100),
              },
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);

        if (activityEvents.length > 0) {
          const { data, error: insertError } = await supabaseAdmin
            .from('activity_events')
            .insert(activityEvents as any)
            .select('id') as { data: any[] | null; error: any };

          if (insertError) {
            console.error('Error inserting activity events:', insertError);
            // Проверяем дубликаты
            if (insertError.code === '23505') {
              console.warn('Some messages were duplicates, continuing...');
              const insertedCount = data?.length || 0;
              skippedCount += activityEvents.length - insertedCount;
              importedCount += insertedCount;
            } else {
              throw insertError;
            }
          } else {
            importedCount += data?.length || 0;
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

      console.log(`Import completed: ${importedCount} imported, ${skippedCount} skipped`);

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

