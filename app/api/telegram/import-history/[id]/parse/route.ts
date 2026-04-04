import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramHistoryParser } from '@/lib/services/telegramHistoryParser';
import { TelegramJsonParser, type ParsedJsonAuthor } from '@/lib/services/telegramJsonParser';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB for large group histories

interface ParticipantMatch {
  // Данные из импорта
  importName: string;
  importUsername?: string;
  importUserId?: number; // ⭐ Telegram User ID из JSON (для правильного ключа)
  importMessageCount: number;
  importDateRange: {
    start: Date;
    end: Date;
  };

  // Существующий участник (если найден)
  existingParticipant?: {
    id: string;
    full_name: string;
    username?: string;
    tg_user_id?: number;
    currentMessageCount: number;
    last_activity_at?: string; // ISO string from database
  };

  // Тип совпадения
  matchType: 'exact' | 'username' | 'fuzzy' | 'none';
  matchConfidence: number; // 0-100

  // Рекомендуемое действие
  recommendedAction: 'merge' | 'create_new';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/import-history/[id]/parse' });
  try {
    const { id: groupId } = await params
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
        }, '[Import History] Access denied (pre-check)');
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
        // Получаем ВСЕ организации, привязанные к группе (их может быть несколько)
        const { data: orgLinks } = await supabaseAdmin
          .from('org_telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', data.tg_chat_id);

        if (orgLinks && orgLinks.length > 0) {
          group = { ...data, org_telegram_groups: orgLinks };
          break;
        }
      }

      if (error?.code !== 'PGRST116') { // not-a-single-row error from maybeSingle
        groupError = error;
      }
    }

    if (groupError && !group) {
      logger.error({ error: groupError.message, group_id: groupId }, 'Group fetch error');
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
        }, '[Import History] Access denied');
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    // Получаем файл из FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Проверяем размер файла
    if (file.size > MAX_FILE_SIZE) {
      await logErrorToDatabase({
        level: 'warn',
        message: `File too large for Telegram import: ${file.size} bytes`,
        errorCode: 'IMPORT_FILE_TOO_LARGE',
        context: {
          endpoint: '/api/telegram/import-history/parse',
          fileSize: file.size,
          maxSize: MAX_FILE_SIZE,
          fileName: file.name
        },
        userId: user.id,
        orgId: orgId || undefined
      })
      return NextResponse.json({
        error: 'File too large',
        message: `Размер файла превышает ${MAX_FILE_SIZE / 1024 / 1024}MB. Попробуйте экспортировать только текстовые сообщения (без медиа).`,
        maxSize: MAX_FILE_SIZE,
      }, { status: 400 });
    }

    // Определяем формат файла
    const isJson = file.name.endsWith('.json') || file.type === 'application/json';
    const isHtml = file.name.endsWith('.html') || file.type === 'text/html';
    
    if (!isJson && !isHtml) {
      await logErrorToDatabase({
        level: 'warn',
        message: `Invalid file type for Telegram import: ${file.type}`,
        errorCode: 'IMPORT_INVALID_FORMAT',
        context: {
          endpoint: '/api/telegram/import-history/parse',
          fileName: file.name,
          fileType: file.type
        },
        userId: user.id,
        orgId: orgId || undefined
      })
      return NextResponse.json({
        error: 'Invalid file type',
        message: 'Пожалуйста, загрузите JSON или HTML файл экспорта Telegram',
        hint: 'Рекомендуется JSON формат - он содержит Telegram User ID для точного сопоставления участников'
      }, { status: 400 });
    }

    // Читаем содержимое файла
    const fileContent = await file.text();

    logger.info({ 
      file_name: file.name,
      file_size: file.size,
      format: isJson ? 'JSON' : 'HTML',
      group_id: groupId,
      org_id: orgId
    }, 'Parsing Telegram history');

    let parsingResult: any;
    let authors: Array<{ name: string; userId?: number; username?: string; messageCount: number; firstMessageDate: Date; lastMessageDate: Date }>;
    
    if (isJson) {
      // ⭐ Parse JSON (preferred format with user_id)
      const validation = TelegramJsonParser.validate(fileContent);
      if (!validation.valid) {
        return NextResponse.json({
          error: 'Invalid Telegram JSON export',
          message: validation.error,
        }, { status: 400 });
      }

      parsingResult = TelegramJsonParser.parse(fileContent);
      authors = Array.from(parsingResult.authors.values());
      
      // 🔒 SECURITY: Validate chat_id matches the group
      // ⚠️ ID группы может быть отрицательным (после получения прав админа) или положительным (в JSON экспорте)
      // Сравниваем абсолютные значения для корректного сопоставления
      const expectedChatId = String((group as any).tg_chat_id);
      const importedChatId = String(parsingResult.chatId);
      const expectedChatIdAbs = Math.abs(Number(expectedChatId));
      const importedChatIdAbs = Math.abs(Number(importedChatId));

      // Telegram Desktop exports use raw supergroup ID (e.g. 2037416113),
      // while Bot API stores it with -100 prefix (e.g. -1002037416113).
      // Strip the -100 prefix for comparison.
      const stripTgPrefix = (id: number) => {
        const abs = Math.abs(id);
        const str = String(abs);
        return str.startsWith('100') && str.length > 10 ? Number(str.slice(3)) : abs;
      };
      const expectedStripped = stripTgPrefix(Number(expectedChatId));
      const importedStripped = stripTgPrefix(Number(importedChatId));

      // Также проверяем название группы для дополнительной безопасности
      const expectedGroupName = (group as any).title?.toLowerCase().trim();
      const importedGroupName = parsingResult.stats.chatName?.toLowerCase().trim();

      const chatIdMatches = expectedChatIdAbs === importedChatIdAbs
        || expectedChatId === importedChatId
        || expectedStripped === importedStripped;
      const nameMatches = expectedGroupName && importedGroupName && expectedGroupName === importedGroupName;
      
      if (!chatIdMatches && !nameMatches) {
        return NextResponse.json({
          error: 'Chat ID mismatch',
          message: `Файл содержит историю другой группы (ID: ${parsingResult.chatId}, название: "${parsingResult.stats.chatName}"). Импорт разрешён только для текущей группы (ID: ${expectedChatId}, название: "${(group as any).title}").`,
          hint: 'Загрузите правильный файл экспорта для этой группы или выберите другую группу в списке.',
          importedChatId: parsingResult.chatId,
          expectedChatId: expectedChatId,
          importedGroupName: parsingResult.stats.chatName,
          expectedGroupName: (group as any).title
        }, { status: 400 });
      }
      
      // Логируем успешное сопоставление
      if (chatIdMatches && nameMatches) {
        logger.debug({ 
          imported_chat_id: importedChatId,
          expected_chat_id: expectedChatId,
          imported_group_name: importedGroupName,
          expected_group_name: expectedGroupName
        }, 'Chat ID and name match');
      } else if (chatIdMatches) {
        logger.warn({ 
          imported_chat_id: importedChatId,
          expected_chat_id: expectedChatId,
          imported_group_name: importedGroupName,
          expected_group_name: expectedGroupName
        }, 'Chat ID matches but name differs');
      } else if (nameMatches) {
        logger.warn({ 
          imported_chat_id: importedChatId,
          expected_chat_id: expectedChatId,
          imported_group_name: importedGroupName,
          expected_group_name: expectedGroupName
        }, 'Chat name matches but ID differs');
      }
      
      logger.info({ 
        total_messages: parsingResult.stats.totalMessages,
        unique_authors: parsingResult.stats.uniqueAuthors,
        format: 'JSON'
      }, 'Parsed Telegram history (JSON format with user IDs)');
    } else {
      // Parse HTML (legacy format without user_id)
      const validation = TelegramHistoryParser.validate(fileContent);
      if (!validation.valid) {
        return NextResponse.json({
          error: 'Invalid Telegram HTML export',
          message: validation.error,
          hint: 'Попробуйте использовать JSON формат для лучшего сопоставления участников'
        }, { status: 400 });
      }

      parsingResult = TelegramHistoryParser.parse(fileContent);
      authors = Array.from(parsingResult.authors.values());
      
      // ⚠️ HTML format doesn't include chat_id, so we can't validate it matches the group
      // This is less secure than JSON format, but allowed for backward compatibility
      logger.warn({ 
        total_messages: parsingResult.stats.totalMessages,
        unique_authors: parsingResult.stats.uniqueAuthors,
        format: 'HTML'
      }, 'Parsed Telegram history (HTML format - no user IDs, no chat_id validation)');
    }

    // Получаем существующих участников организации (не только этой группы!)
    // Это позволяет находить участников, которые есть в других группах организации
    const { data: existingParticipants, error: participantsError } = await supabaseAdmin
      .from('participants')
      .select(`
        id,
        full_name,
        username,
        tg_user_id,
        tg_first_name,
        tg_last_name,
        last_activity_at
      `)
      .eq('org_id', orgId);

    if (participantsError) {
      logger.error({ error: participantsError.message, org_id: orgId }, 'Error fetching participants');
      return NextResponse.json({ error: 'Failed to fetch participants' }, { status: 500 });
    }

    // Получаем статистику сообщений для существующих участников
    // activity_events uses tg_user_id, not participant_id
    const tgUserIds = (existingParticipants || [])
      .filter((p: any) => p.tg_user_id)
      .map((p: any) => p.tg_user_id);

    const tgToParticipantId = new Map<number, string>();
    (existingParticipants || []).forEach((p: any) => {
      if (p.tg_user_id) tgToParticipantId.set(Number(p.tg_user_id), p.id);
    });

    const messageCountMap = new Map<string, number>();

    if (tgUserIds.length > 0) {
      const { data: messageStats } = await supabaseAdmin
        .from('activity_events')
        .select('tg_user_id')
        .eq('org_id', orgId)
        .eq('tg_chat_id', group.tg_chat_id)
        .eq('event_type', 'message')
        .in('tg_user_id', tgUserIds);

      (messageStats || []).forEach((stat: any) => {
        const participantId = tgToParticipantId.get(Number(stat.tg_user_id));
        if (participantId) {
          const count = messageCountMap.get(participantId) || 0;
          messageCountMap.set(participantId, count + 1);
        }
      });
    }

    // Сопоставляем авторов из импорта с существующими участниками
    const matches: ParticipantMatch[] = [];

    for (const author of authors) {
      // Пропускаем ботов
      if (isBot(author.name, author.username)) {
        logger.debug({ name: author.name, username: author.username }, 'Skipping bot');
        continue;
      }

      const match = findParticipantMatch(
        author,
        existingParticipants || [],
        messageCountMap,
        isJson // ⭐ Pass format flag to enable user_id matching
      );
      // ⭐ Добавляем userId для JSON формата
      if (isJson && author.userId) {
        match.importUserId = author.userId;
      }
      matches.push(match);
    }

    // Статистика
    const exactMatches = matches.filter(m => m.matchType === 'exact' || m.matchType === 'username').length;
    const fuzzyMatches = matches.filter(m => m.matchType === 'fuzzy').length;
    const newParticipants = matches.filter(m => m.matchType === 'none').length;
    const botsFiltered = authors.length - matches.length;

    // Count how many messages are already imported for this group
    const { count: existingMessagesInDb } = await supabaseAdmin
      .from('activity_events')
      .select('*', { count: 'exact', head: true })
      .eq('tg_chat_id', group.tg_chat_id)
      .eq('event_type', 'message');

    // Count total participants in this group
    const { count: existingParticipantsInGroup } = await supabaseAdmin
      .from('participant_groups')
      .select('*', { count: 'exact', head: true })
      .eq('tg_group_id', group.tg_chat_id);

    logger.info({ 
      exact_matches: exactMatches,
      fuzzy_matches: fuzzyMatches,
      new_participants: newParticipants,
      bots_filtered: botsFiltered,
      existing_messages_in_db: existingMessagesInDb,
      existing_participants_in_group: existingParticipantsInGroup
    }, 'Participant matching complete');

    return NextResponse.json({
      success: true,
      data: {
        filename: file.name,
        fileSize: file.size,
        stats: {
          totalMessages: parsingResult.stats.totalMessages,
          uniqueAuthors: parsingResult.stats.uniqueAuthors,
          dateRange: parsingResult.dateRange,
          existingMessagesInDb: existingMessagesInDb || 0,
          existingParticipantsInGroup: existingParticipantsInGroup || 0,
          botsFiltered,
        },
        matches: matches.map(m => ({
          ...m,
          importDateRange: {
            start: m.importDateRange.start.toISOString(),
            end: m.importDateRange.end.toISOString(),
          },
          existingParticipant: m.existingParticipant ? {
            ...m.existingParticipant,
            // last_activity_at уже строка из базы данных
            last_activity_at: m.existingParticipant.last_activity_at,
          } : undefined,
        })),
        matchStats: {
          exactMatches,
          fuzzyMatches,
          newParticipants,
        },
      },
    });
  } catch (error: any) {
    await logErrorToDatabase({
      level: 'error',
      message: error.message || 'Unknown error parsing Telegram history',
      errorCode: 'IMPORT_SERVER_ERROR',
      context: {
        endpoint: '/api/telegram/import-history/parse',
        errorType: error.constructor?.name || typeof error
      },
      stackTrace: error.stack
    })
    return NextResponse.json({
      error: 'Failed to parse file',
      message: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Находит совпадение участника из импорта с существующими
 */
function findParticipantMatch(
  importAuthor: { name: string; userId?: number; username?: string; messageCount: number; firstMessageDate: Date; lastMessageDate: Date },
  existingParticipants: any[],
  messageCountMap: Map<string, number>,
  hasUserId: boolean = false
): ParticipantMatch {
  let bestMatch: any = null;
  let matchType: 'exact' | 'username' | 'fuzzy' | 'none' = 'none';
  let confidence = 0;

  // ⭐ 0. PERFECT MATCH: По Telegram User ID (только для JSON формата)
  if (hasUserId && importAuthor.userId) {
    const userIdMatch = existingParticipants.find(
      p => p.tg_user_id === importAuthor.userId
    );
    if (userIdMatch) {
      bestMatch = userIdMatch;
      matchType = 'exact';
      confidence = 100; // 💯 Perfect match!
      
      // Early return - no need for other checks
      const result: ParticipantMatch = {
        importName: importAuthor.name,
        importUsername: importAuthor.username,
        importMessageCount: importAuthor.messageCount,
        importDateRange: {
          start: importAuthor.firstMessageDate,
          end: importAuthor.lastMessageDate,
        },
        matchType,
        matchConfidence: confidence,
        recommendedAction: 'merge',
        existingParticipant: {
          id: userIdMatch.id,
          full_name: userIdMatch.full_name,
          username: userIdMatch.username,
          tg_user_id: userIdMatch.tg_user_id,
          currentMessageCount: messageCountMap.get(userIdMatch.id) || 0,
          last_activity_at: userIdMatch.last_activity_at,
        },
      };
      return result;
    }
  }

  // 1. Точное совпадение по username
  if (importAuthor.username) {
    const usernameMatch = existingParticipants.find(
      p => p.username?.toLowerCase() === importAuthor.username?.toLowerCase()
    );
    if (usernameMatch) {
      bestMatch = usernameMatch;
      matchType = 'username';
      confidence = 95;
    }
  }

  // 2. Точное совпадение по Telegram имени (tg_first_name + tg_last_name)
  if (!bestMatch) {
    const normalizedImportName = importAuthor.name.toLowerCase().trim();
    const telegramNameMatch = existingParticipants.find(p => {
      const tgFullName = `${p.tg_first_name || ''} ${p.tg_last_name || ''}`.trim().toLowerCase();
      const tgFirstName = p.tg_first_name?.toLowerCase().trim() || '';
      
      // Точное совпадение с полным Telegram именем
      if (tgFullName === normalizedImportName) {
        return true;
      }
      
      // Совпадение только с первым именем (если в импорте только имя без фамилии)
      if (tgFirstName === normalizedImportName) {
        return true;
      }
      
      return false;
    });
    
    if (telegramNameMatch) {
      bestMatch = telegramNameMatch;
      matchType = 'exact';
      confidence = 92; // Высокая уверенность - это оригинальное имя из Telegram
    }
  }

  // 3. Точное совпадение по полному имени (редактируемое поле)
  if (!bestMatch) {
    const nameMatch = existingParticipants.find(
      p => p.full_name?.toLowerCase().trim() === importAuthor.name.toLowerCase().trim()
    );
    if (nameMatch) {
      bestMatch = nameMatch;
      matchType = 'exact';
      confidence = 90;
    }
  }

  // 4. Проверяем, содержится ли импортируемое имя в full_name
  // (например, "Александр" содержится в "Александр Марчук")
  if (!bestMatch) {
    const normalizedImportName = importAuthor.name.toLowerCase().trim();
    const partialMatch = existingParticipants.find(p => {
      const fullName = p.full_name?.toLowerCase().trim() || '';
      // Проверяем, что импортируемое имя - это первое слово в full_name
      const firstWord = fullName.split(/\s+/)[0];
      return firstWord === normalizedImportName || fullName.includes(normalizedImportName);
    });
    
    if (partialMatch) {
      bestMatch = partialMatch;
      matchType = 'exact';
      confidence = 85; // Чуть ниже, чем точное совпадение
    }
  }

  // 3. Fuzzy match по имени (частичное совпадение)
  if (!bestMatch) {
    const normalizedImportName = importAuthor.name.toLowerCase().trim();
    const fuzzyMatches = existingParticipants
      .map(p => ({
        participant: p,
        similarity: calculateSimilarity(normalizedImportName, p.full_name?.toLowerCase().trim() || ''),
      }))
      .filter(m => m.similarity > 0.7) // Порог 70%
      .sort((a, b) => b.similarity - a.similarity);

    if (fuzzyMatches.length > 0) {
      bestMatch = fuzzyMatches[0].participant;
      matchType = 'fuzzy';
      confidence = Math.round(fuzzyMatches[0].similarity * 100);
    }
  }

  // Формируем результат
  const result: ParticipantMatch = {
    importName: importAuthor.name,
    importUsername: importAuthor.username,
    importMessageCount: importAuthor.messageCount,
    importDateRange: {
      start: importAuthor.firstMessageDate,
      end: importAuthor.lastMessageDate,
    },
    matchType,
    matchConfidence: confidence,
    recommendedAction: bestMatch && confidence > 70 ? 'merge' : 'create_new',
  };

  if (bestMatch) {
    result.existingParticipant = {
      id: bestMatch.id,
      full_name: bestMatch.full_name,
      username: bestMatch.username,
      tg_user_id: bestMatch.tg_user_id,
      currentMessageCount: messageCountMap.get(bestMatch.id) || 0,
      last_activity_at: bestMatch.last_activity_at,
    };
  }

  return result;
}

/**
 * Вычисляет схожесть двух строк (алгоритм Левенштейна упрощенный)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  // Подсчитываем расстояние редактирования
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Проверяет, является ли автор ботом
 */
function isBot(name: string, username?: string): boolean {
  const lowerUsername = username?.toLowerCase() || '';
  const lowerName = name.toLowerCase().trim();

  // Проверяем username - заканчивается на 'bot'
  if (lowerUsername.endsWith('bot')) {
    return true;
  }

  // Проверяем имя - заканчивается на 'bot' (например, ChatKeeperBot)
  if (lowerName.endsWith('bot')) {
    return true;
  }

  // Проверяем точные совпадения известных ботов по имени
  const knownBots = ['orbo', 'bot', 'telegram'];
  if (knownBots.includes(lowerName)) {
    return true;
  }

  return false;
}

