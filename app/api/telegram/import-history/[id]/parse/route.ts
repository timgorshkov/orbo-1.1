import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramHistoryParser } from '@/lib/services/telegramHistoryParser';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

interface ParticipantMatch {
  // Данные из импорта
  importName: string;
  importUsername?: string;
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

    // Проверяем права пользователя в организации
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Получаем файл из FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Проверяем размер файла
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'File too large',
        message: `Размер файла превышает ${MAX_FILE_SIZE / 1024 / 1024}MB. Telegram автоматически разбивает экспорт на файлы < 1MB. Загрузите файлы по одному.`,
        maxSize: MAX_FILE_SIZE,
      }, { status: 400 });
    }

    // Проверяем тип файла
    if (!file.name.endsWith('.html') && file.type !== 'text/html') {
      return NextResponse.json({
        error: 'Invalid file type',
        message: 'Пожалуйста, загрузите HTML файл экспорта Telegram',
      }, { status: 400 });
    }

    // Читаем содержимое файла
    const htmlContent = await file.text();

    // Валидируем HTML
    const validation = TelegramHistoryParser.validate(htmlContent);
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Invalid Telegram export',
        message: validation.error,
      }, { status: 400 });
    }

    console.log(`Parsing Telegram history from ${file.name} (${file.size} bytes)`);

    // Парсим HTML
    const parsingResult = TelegramHistoryParser.parse(htmlContent);

    console.log(`Parsed ${parsingResult.stats.totalMessages} messages from ${parsingResult.stats.uniqueAuthors} authors`);

    // Получаем существующих участников группы
    const { data: existingParticipants, error: participantsError } = await supabaseAdmin
      .from('participants')
      .select(`
        id,
        full_name,
        username,
        tg_user_id,
        tg_first_name,
        tg_last_name,
        last_activity_at,
        participant_groups!inner(tg_group_id)
      `)
      .eq('org_id', orgId)
      .eq('participant_groups.tg_group_id', group.tg_chat_id);

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
      return NextResponse.json({ error: 'Failed to fetch participants' }, { status: 500 });
    }

    // Получаем статистику сообщений для существующих участников
    const participantIds = (existingParticipants || []).map((p: any) => p.id);
    const { data: messageStats } = await supabaseAdmin
      .from('activity_events')
      .select('participant_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', group.tg_chat_id)
      .eq('event_type', 'message')
      .in('participant_id', participantIds);

    // Подсчитываем сообщения для каждого участника
    const messageCountMap = new Map<string, number>();
    (messageStats || []).forEach((stat: any) => {
      const count = messageCountMap.get(stat.participant_id) || 0;
      messageCountMap.set(stat.participant_id, count + 1);
    });

    // Сопоставляем авторов из импорта с существующими участниками
    const matches: ParticipantMatch[] = [];

    for (const [authorKey, author] of Array.from(parsingResult.authors.entries())) {
      // Пропускаем ботов
      if (isBot(author.name, author.username)) {
        console.log(`Skipping bot: ${author.name} (@${author.username || 'no username'})`);
        continue;
      }

      const match = findParticipantMatch(
        author,
        existingParticipants || [],
        messageCountMap
      );
      matches.push(match);
    }

    // Статистика
    const exactMatches = matches.filter(m => m.matchType === 'exact' || m.matchType === 'username').length;
    const fuzzyMatches = matches.filter(m => m.matchType === 'fuzzy').length;
    const newParticipants = matches.filter(m => m.matchType === 'none').length;

    console.log(`Matches: ${exactMatches} exact, ${fuzzyMatches} fuzzy, ${newParticipants} new`);

    return NextResponse.json({
      success: true,
      data: {
        filename: file.name,
        fileSize: file.size,
        stats: {
          totalMessages: parsingResult.stats.totalMessages,
          uniqueAuthors: parsingResult.stats.uniqueAuthors,
          dateRange: parsingResult.dateRange,
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
    console.error('Error parsing Telegram history:', error);
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
  importAuthor: { name: string; username?: string; messageCount: number; firstMessageDate: Date; lastMessageDate: Date },
  existingParticipants: any[],
  messageCountMap: Map<string, number>
): ParticipantMatch {
  let bestMatch: any = null;
  let matchType: 'exact' | 'username' | 'fuzzy' | 'none' = 'none';
  let confidence = 0;

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

  // Проверяем username - заканчивается на 'bot'
  if (lowerUsername.endsWith('bot')) {
    return true;
  }

  // Проверяем точные совпадения известных ботов по имени
  const knownBots = ['orbo', 'bot', 'telegram'];
  const lowerName = name.toLowerCase().trim();
  if (knownBots.includes(lowerName)) {
    return true;
  }

  return false;
}

