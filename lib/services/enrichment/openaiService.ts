/**
 * OpenAI Service for Participant Enrichment
 * 
 * Uses ChatGPT API to extract:
 * - Interests and expertise areas
 * - Recent asks/questions
 * - City/location (if mentioned)
 * 
 * Cost-conscious: Only runs on demand (manual trigger by owner)
 * 
 * AUTO-LOGS all API calls to openai_api_logs table
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { openai } from '../openaiClient';
import { createServiceLogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

const logger = createServiceLogger('OpenAI');

// Supabase admin client for logging
const supabaseAdmin = createAdminServer();

/**
 * Log OpenAI API call to database
 */
async function logOpenAICall(params: {
  orgId: string | null;
  userId: string | null;
  requestType: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  metadata?: any;
}): Promise<void> {
  try {
    const costRub = params.costUsd * 95; // Approximate conversion
    
    const { error } = await supabaseAdmin
      .from('openai_api_logs')
      .insert({
        org_id: params.orgId,
        created_by: params.userId,
        request_type: params.requestType,
        model: params.model,
        prompt_tokens: params.promptTokens,
        completion_tokens: params.completionTokens,
        total_tokens: params.totalTokens,
        cost_usd: params.costUsd,
        cost_rub: costRub,
        metadata: params.metadata || {}
      });
    
    if (error) {
      logger.error({ 
        org_id: params.orgId,
        user_id: params.userId,
        request_type: params.requestType,
        error: error.message,
        error_code: error.code,
        error_details: error.details
      }, '❌ [OPENAI_LOG] Failed to insert API log to database');
      // Don't throw - logging failure shouldn't break enrichment
    } else {
      logger.info({
        org_id: params.orgId,
        request_type: params.requestType,
        total_tokens: params.totalTokens,
        cost_usd: params.costUsd
      }, '✅ [OPENAI_LOG] API call logged successfully');
    }
  } catch (logError) {
    logger.error({ 
      org_id: params.orgId,
      user_id: params.userId,
      error: logError instanceof Error ? logError.message : String(logError),
      stack: logError instanceof Error ? logError.stack : undefined
    }, '❌ [OPENAI_LOG] Exception while logging API call');
    // Don't throw - logging failure shouldn't break enrichment
  }
}

/**
 * Message with context for AI analysis
 */
export interface MessageWithContext {
  id: string;
  text: string;
  author_name: string;
  created_at: string;
  is_participant: boolean; // true if this message is from the analyzed participant
  
  // Контекст ответа (reply_to)
  reply_to_text?: string;       // Текст сообщения, на которое отвечает
  reply_to_author?: string;     // Автор оригинального сообщения
  
  // Контекст треда (сообщения до/после)
  thread_context?: string[];    // 2-3 сообщения до/после для контекста
}

/**
 * AI Enrichment Result
 */
export interface AIEnrichmentResult {
  interests_keywords: string[];          // Specific named entities: technologies, tools, brands
  topics_discussed: Record<string, number>; // Broad thematic categories -> mention count
  recent_asks: string[];                 // Substantive requests (services, contractors, advice)
  city_inferred?: string;                // City if mentioned
  city_confidence?: number;              // 0-1 confidence

  // Introduction message extraction (if a self-intro was found)
  introduction_raw?: string;             // Full verbatim text of the intro message
  introduction_bio?: string;             // 2-3 sentence summary extracted from intro
  introduction_goals?: string;           // What they want / looking for
  introduction_offers?: string[];        // What they can help with / offer
  introduction_asks?: string[];          // What they need / looking for

  // Meta
  tokens_used: number;
  cost_usd: number;
  analysis_date: string;
}

/**
 * Patterns that indicate an introduction / self-presentation message.
 *
 * Scoring rules:
 *  - Hashtag match  → +4 (near-certain signal)
 *  - Strong pattern → +3 (explicit self-description)
 *  - Weak pattern   → +2 (likely self-description)
 *  - Length bonus   → +1 only when score > 0 already (real intro messages tend to be long)
 *  - Negative hit   → skip entirely
 *
 * Threshold: >= 3  (1 strong pattern passes; 1 weak + length passes)
 */
const INTRO_HASHTAGS = [
  '#визитка', '#знакомство', '#about', '#мояистория', '#представляюсь', '#новичок',
  '#intro', '#aboutme', '#обомне', '#самопрезентация',
];

// Strong signals: explicitly describes who the person IS
const INTRO_PATTERNS_STRONG = [
  /меня зовут\s+\S/i,
  /я\s+[-–—]\s*\S/i,                               // "Я — Тимур, ..."
  /я\s+(?:основатель|сооснователь|директор|руководитель|генеральный|ceo|cto|coo|cfo|cmo|cpo)/i,
  /я\s+(?:занимаюсь|управляю|развиваю|строю|создаю|веду|возглавляю)\s+\S/i,
  /моя?\s+(?:компания|студия|агентство|команда|сфера|экспертиза|фирма|бизнес)/i,
  /обо мне/i,
  /о себе/i,
  /кратко о себе/i,
  /представлюсь/i,
  /давайте познакомимся/i,
  /коллеги,?\s*привет/i,                            // "Коллеги, привет! Я..."
];

// Weak signals: may indicate self-description
const INTRO_PATTERNS_WEAK = [
  /привет[,!]?\s*(всем)?[,!]?\s*я\s+/i,
  /добрый день[,!]?\s*(?:всем[,!]?\s*)?я\s+/i,
  /здравствуйте[,!]?\s*я\s+/i,
  /расскажу о себе/i,
  /немного о себе/i,
  /я\s+(?:работаю|помогаю|фрилансер|консультант|эксперт|предприниматель|специалист|инженер|аналитик|маркетолог)\b/i,
  /чем я занимаюсь/i,
  /моя деятельность/i,
  /сферы?\s+(?:моей|моих)\s+(?:деятельности|интересов|компетенций)/i,
  /специализируюсь\s+(?:на|в)\s+/i,
  /мой\s+(?:опыт|бэкграунд|профиль)/i,
  /открыт[аы]?\s+(?:к|для)\s+(?:сотрудничеств|предложени|контакт)/i,
  /могу быть полез/i,
  /готов[аы]?\s+(?:помочь|поделиться|сотрудничать)/i,
  /ищу\s+(?:партнёр|подрядчик|клиент|заказ|проект|работу|сотруднич)/i,
];

// Negative indicators: these strongly suggest the message is NOT a self-introduction
const INTRO_NEGATIVE = [
  /\b(он|она|они)\b.{0,30}\b(ответил|написал|сказал|спросил|сообщил)\b/i,
];

/**
 * Detect an introduction/self-presentation message from a list of messages.
 * Returns the highest-scoring message only when the score is >= 3.
 */
function detectIntroductionMessage(messages: MessageWithContext[]): MessageWithContext | null {
  let best: MessageWithContext | null = null;
  let bestScore = 0;

  for (const m of messages) {
    if (!m.is_participant) continue;
    const text = m.text;

    // Skip messages that clearly describe events/actions about others
    const hasNegative = INTRO_NEGATIVE.some(p => p.test(text));
    if (hasNegative) continue;

    let score = 0;

    for (const tag of INTRO_HASHTAGS) {
      if (text.toLowerCase().includes(tag)) score += 4;
    }
    for (const pattern of INTRO_PATTERNS_STRONG) {
      if (pattern.test(text)) score += 3;
    }
    for (const pattern of INTRO_PATTERNS_WEAK) {
      if (pattern.test(text)) score += 2;
    }
    // Length bonus only when there is already a positive signal
    if (score > 0 && text.length > 300) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return bestScore >= 3 ? best : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Pass 1: Introduction extraction (runs only when goals fields are empty)
// ──────────────────────────────────────────────────────────────────────────────

interface IntroExtractionResult {
  introduction_raw: string;
  introduction_bio: string | null;
  introduction_goals: string | null;
  introduction_offers: string[];
  introduction_asks: string[];
  tokens_used: number;
  cost_usd: number;
}

async function extractIntroduction(
  introMessage: MessageWithContext,
  participantName: string,
  orgId: string,
  userId: string | null,
  participantId: string | null,
): Promise<IntroExtractionResult> {
  const systemPrompt = `Ты — аналитик сообществ. Тебе дано сообщение-визитка участника (представление в группе). 
Извлеки из него структурированную информацию.

Верни JSON:
- "bio": краткое резюме кто этот человек (2-3 предложения). Не пересказывай текст, а обобщи суть.
- "goals": чего ищет / зачем пришёл в сообщество (строка) или null
- "offers": чем может помочь другим (массив строк, 1-5 пунктов) или []
- "asks": что нужно / ищет (массив строк, 1-5 пунктов) или []`;

  const userPrompt = `Участник: ${participantName}

Сообщение-визитка:
${introMessage.text.slice(0, 3000)}

Извлеки bio, goals, offers, asks. Верни JSON.`;

  const startTime = Date.now();
  logger.info({ participant_id: participantId, participant_name: participantName }, '🪪 [OPENAI_CALL] Starting introduction extraction');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 600,
    response_format: { type: 'json_object' }
  });

  const raw = response.choices[0].message.content || '{}';
  const result = JSON.parse(raw);

  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const totalTokens = response.usage?.total_tokens || 0;
  const costUsd = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000);

  logger.info({
    participant_id: participantId,
    has_bio: !!result.bio,
    has_goals: !!result.goals,
    offers_count: result.offers?.length || 0,
    asks_count: result.asks?.length || 0,
    tokens: totalTokens,
    cost_usd: costUsd,
    duration_ms: Date.now() - startTime,
  }, '🪪 Introduction extraction completed');

  await logOpenAICall({
    orgId, userId,
    requestType: 'participant_intro_extraction',
    model: 'gpt-4o-mini',
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens, costUsd,
    metadata: { participant_id: participantId, participant_name: participantName }
  });

  return {
    introduction_raw: introMessage.text,
    introduction_bio: result.bio || null,
    introduction_goals: result.goals || null,
    introduction_offers: Array.isArray(result.offers) ? result.offers : [],
    introduction_asks: Array.isArray(result.asks) ? result.asks : [],
    tokens_used: totalTokens,
    cost_usd: costUsd,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Pass 2: Main analysis (interests, topics, asks)  — always runs
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Analyze participant's messages with AI (two-pass approach)
 * 
 * Pass 1 (conditional): Extract introduction message → fill goals/offers/bio
 * Pass 2 (always): Analyze interests, topics, asks from recent messages
 */
export async function analyzeParticipantWithAI(
  messages: MessageWithContext[],
  participantName: string,
  orgId: string,
  userId: string | null = null,
  participantId: string | null = null,
  groupKeywords: string[] = [],
  reactedMessages: Array<{ text: string; emoji: string; author?: string }> = [],
  additionalContext?: {
    eventSummary?: string[];
    applicationSummary?: string[];
    profileContext?: string[];
  },
  options?: {
    hasGoals?: boolean;
  }
): Promise<AIEnrichmentResult> {
  const now = new Date();

  const sortedMessages = [...messages].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const recentMessages = sortedMessages.slice(0, 50);

  // ── Pass 1: Introduction extraction (only when goals are not filled) ──
  let introResult: IntroExtractionResult | null = null;
  const needsIntroScan = !options?.hasGoals;

  if (needsIntroScan) {
    const introMessage = detectIntroductionMessage(sortedMessages);
    if (introMessage) {
      try {
        introResult = await extractIntroduction(introMessage, participantName, orgId, userId, participantId);
      } catch (err) {
        logger.warn({ participant_id: participantId, error: err instanceof Error ? err.message : String(err) },
          '⚠️ Introduction extraction failed, continuing with main analysis');
      }
    }
  }

  // ── Pass 2: Main analysis (interests, topics, asks) ──
  // Build profile context, including goals from intro if we just extracted them
  const goalsContext: string[] = [];
  if (introResult?.introduction_goals) goalsContext.push(`Цели: ${introResult.introduction_goals}`);
  if (introResult?.introduction_offers?.length) goalsContext.push(`Предлагает: ${introResult.introduction_offers.join(', ')}`);
  if (introResult?.introduction_asks?.length) goalsContext.push(`Ищет: ${introResult.introduction_asks.join(', ')}`);

  let profileSection = '';
  const profileLines = [
    ...(additionalContext?.profileContext || []),
    ...goalsContext,
  ];
  if (profileLines.length > 0) {
    profileSection = `\n\n--- ПРОФИЛЬ УЧАСТНИКА ---\n${profileLines.join('\n')}`;
  }

  let eventsSection = '';
  if (additionalContext?.eventSummary && additionalContext.eventSummary.length > 0) {
    eventsSection = `\n\n--- СОБЫТИЯ, НА КОТОРЫЕ ЗАРЕГИСТРИРОВАЛСЯ УЧАСТНИК (используй названия в interests!) ---\n${additionalContext.eventSummary.map(e => `📅 ${e}`).join('\n')}`;
  }

  let applicationsSection = '';
  if (additionalContext?.applicationSummary && additionalContext.applicationSummary.length > 0) {
    applicationsSection = `\n\n--- ЗАЯВКИ ---\n${additionalContext.applicationSummary.map(a => `📋 ${a}`).join('\n')}`;
  }

  const reactedSection = reactedMessages.length > 0
    ? `\n\n--- РЕАКЦИИ УЧАСТНИКА ---\n\n${
        reactedMessages.map(r => {
          const authorInfo = r.author ? ` (${r.author})` : '';
          return `🔥 ${r.emoji}${authorInfo}: ${r.text}`;
        }).join('\n\n')
      }`
    : '';

  const systemPrompt = `Ты — аналитик сообществ. Проанализируй сообщения участника и заполни ВСЕ поля.

1. **interests** (массив, СТРОГО 3-6 элементов — только самые значимые):
   ПРАВИЛА: выбирай только то, что можно назвать по имени — конкретный предмет, отрасль, продукт, страна, имя человека.
   ✅ ХОРОШО: "БАДы", "краткосрочные инвестиции", "Узбекистан", "кальян", "недвижимость", "GPT-4", "Figma", "Notion", "e-commerce", "EdTech"
   ❌ ПЛОХО (запрещено!): "бизнес", "технологии", "коммуникации", "работа", "развитие", "навигация", "взаимодействие" — это не интересы, это слова-пустышки
   ОБЯЗАТЕЛЬНО включи: названия событий из раздела 📅, конкретные отрасли/продукты упомянутые участником, страны/города/места.
   Если конкретики совсем нет — верни 1-3 наиболее специфичных термина, лучше меньше да точнее.

2. **topics_discussed** (объект, 3-8 тем):
   Широкие тематические категории + число упоминаний. Пример: {"маркетинг": 5, "нетворкинг": 3}.

3. **recent_asks** (массив): Вопросы и запросы участника из переписки — просьбы о рекомендациях, поиск подрядчиков/услуг/инструментов, советы, помощь. Не включай шутки и риторические вопросы. Максимум 5. [] если нет.

4. **city** (строка или null), **city_confidence** (0-1 или null).

Формат сообщений: ➡️ своё, ↩️ reply-контекст, 🔥 реакция, 💬 контекст треда, 📅 событие (включай в interests!), 📋 заявка, 👤 профиль.

⚠️ interests и topics_discussed — ОБЯЗАТЕЛЬНЫ. В interests — только конкретные предметные слова, НЕ абстракции.
Возвращай только JSON.`;

  const userPrompt = `Участник: ${participantName}${profileSection}

Сообщения (от новых к старым):

${recentMessages.map((m) => {
  const date = new Date(m.created_at);
  const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  let messageBlock = '';

  if (m.reply_to_text) {
    const authorInfo = m.reply_to_author ? ` (${m.reply_to_author})` : '';
    messageBlock += `↩️${authorInfo}: ${m.reply_to_text.slice(0, 200)}${m.reply_to_text.length > 200 ? '...' : ''}\n`;
  }

  if (m.thread_context && m.thread_context.length > 0) {
    m.thread_context.forEach(ctx => {
      messageBlock += `💬 ${ctx.slice(0, 150)}${ctx.length > 150 ? '...' : ''}\n`;
    });
  }

  messageBlock += `➡️ [${daysAgo}д назад] ${m.text.slice(0, 500)}${m.text.length > 500 ? '...' : ''}`;

  return messageBlock;
}).join('\n\n')}${eventsSection}${reactedSection}${applicationsSection}

Верни JSON с полями: interests (3-6 конкретных предметов, НЕ абстракций), topics_discussed, recent_asks, city, city_confidence.`;

  try {
    const startTime = Date.now();
    
    logger.info({
      participant_id: participantId,
      participant_name: participantName,
      messages_count: messages.length,
      recent_count: recentMessages.length,
      has_intro: !!introResult,
      org_id: orgId
    }, '🚀 [OPENAI_CALL] Starting main AI analysis');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    });
    
    const finishReason = response.choices[0]?.finish_reason;
    if (finishReason === 'length') {
      logger.warn({ participant_id: participantId }, '⚠️ Main analysis truncated (finish_reason=length)');
    }
    
    const rawResponse = response.choices[0].message.content || '{}';
    const result = JSON.parse(rawResponse);
    
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;
    const costUsd = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000);

    // Accumulate cost from both passes
    const totalCost = costUsd + (introResult?.cost_usd || 0);
    const totalTokensBoth = totalTokens + (introResult?.tokens_used || 0);
    
    logger.info({ 
      participant_id: participantId,
      interests_count: result.interests?.length || 0,
      topics_count: Object.keys(result.topics_discussed || {}).length,
      asks_count: result.recent_asks?.length || 0,
      total_tokens: totalTokensBoth,
      cost_usd: totalCost,
      pass2_tokens: totalTokens,
      pass1_tokens: introResult?.tokens_used || 0,
    }, 'AI enrichment completed (two-pass)');

    logger.debug({
      participant_id: participantId,
      raw_interests: result.interests,
      raw_topics: result.topics_discussed,
    }, 'AI enrichment raw result');
    
    await logOpenAICall({
      orgId, userId,
      requestType: 'participant_enrichment',
      model: 'gpt-4o-mini',
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens, costUsd,
      metadata: {
        participant_id: participantId,
        participant_name: participantName,
        message_count: messages.length,
        analysis_duration_ms: Date.now() - startTime,
        had_intro_pass: !!introResult,
      }
    });
    
    return {
      interests_keywords: result.interests || [],
      topics_discussed: result.topics_discussed || {},
      recent_asks: result.recent_asks || [],
      city_inferred: result.city || undefined,
      city_confidence: result.city_confidence || undefined,

      introduction_raw: introResult?.introduction_raw || undefined,
      introduction_bio: introResult?.introduction_bio || undefined,
      introduction_goals: introResult?.introduction_goals || undefined,
      introduction_offers: introResult?.introduction_offers?.length ? introResult.introduction_offers : undefined,
      introduction_asks: introResult?.introduction_asks?.length ? introResult.introduction_asks : undefined,

      tokens_used: totalTokensBoth,
      cost_usd: totalCost,
      analysis_date: new Date().toISOString()
    };
  } catch (error) {
    let errorType = 'unknown';
    let errorDetails: any = {};
    
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
        errorType = 'network_error';
        errorDetails.hint = 'Check if OPENAI_PROXY_URL is set correctly';
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorType = 'auth_error';
        errorDetails.hint = 'Check if OPENAI_API_KEY is valid';
      } else if (error.message.includes('429') || error.message.includes('rate limit') || error.message.toLowerCase().includes('quota')) {
        errorType = 'rate_limit';
        errorDetails.hint = 'OpenAI rate limit exceeded, try again later';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorType = 'blocked';
        errorDetails.hint = 'Access blocked, check proxy configuration';
      }
    }
    
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ 
      participant_id: participantId,
      participant_name: participantName,
      org_id: orgId,
      error_type: errorType,
      error: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
      ...errorDetails
    }, `❌ [OPENAI_CALL] AI enrichment failed: ${errorType}`);
    if (errorType === 'rate_limit') {
      await logErrorToDatabase({
        level: 'error',
        message: 'OpenAI quota exceeded (429) in participant AI enrichment',
        errorCode: 'OPENAI_QUOTA_EXCEEDED',
        context: { service: 'openaiService', error_type: errorType, error: errMsg, ...errorDetails },
        stackTrace: error instanceof Error ? error.stack : undefined,
        orgId,
      }).catch(() => {});
    }
    throw new Error(`AI analysis failed: ${errMsg}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Contact extraction from messages (separate, on-demand pass)
// ──────────────────────────────────────────────────────────────────────────────

export interface ExtractedContacts {
  phone?: string;
  email?: string;
  telegram_link?: string;
  company?: string;
  position?: string;
  confidence: number; // 0-1 overall confidence
  tokens_used: number;
  cost_usd: number;
}

/**
 * Extract contact information from participant messages.
 * Only extracts contacts that the participant shares about THEMSELVES —
 * not contacts of other people or organizations.
 */
export async function extractContactsFromMessages(
  messages: MessageWithContext[],
  participantName: string,
  orgId: string,
  userId: string | null = null,
  participantId: string | null = null,
): Promise<ExtractedContacts> {
  const ownMessages = messages
    .filter(m => m.is_participant && m.text.length > 10)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 80);

  if (ownMessages.length === 0) {
    return { confidence: 0, tokens_used: 0, cost_usd: 0 };
  }

  const systemPrompt = `Ты — аналитик сообщений сообщества. Из переписки участника извлеки ЕГО СОБСТВЕННЫЕ контактные данные и профессиональную информацию.

КРИТИЧЕСКИ ВАЖНО:
- Извлекай ТОЛЬКО контакты, которые человек указывает КАК СВОИ (например, "мой телефон", "пишите мне", подпись в визитке, "я работаю в...").
- НЕ извлекай контакты других людей, компаний-клиентов, сервисов, служб поддержки.
- НЕ извлекай ссылки на каналы, группы, боты — только личные профили.
- Если не уверен на 80%+ что контакт принадлежит именно этому участнику — НЕ включай.

Верни JSON:
- "phone": номер телефона (string) или null
- "email": email (string) или null
- "telegram_link": ссылка на личный Telegram (t.me/username) или @username (string) или null
- "company": название компании где работает/которой владеет (string) или null
- "position": должность / роль (string) или null
- "confidence": общая уверенность 0.0-1.0 что найденное верно

Если ничего достоверного не найдено, верни все null и confidence: 0.`;

  const messagesText = ownMessages
    .map(m => `[${new Date(m.created_at).toLocaleDateString('ru-RU')}] ${m.text.slice(0, 600)}`)
    .join('\n\n');

  const userPrompt = `Участник: ${participantName}

Его сообщения:

${messagesText}

Извлеки контакты ТОЛЬКО этого участника. JSON.`;

  const startTime = Date.now();
  logger.info({ participant_id: participantId, participant_name: participantName }, '📇 [OPENAI_CALL] Starting contact extraction');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: 'json_object' }
  });

  const raw = response.choices[0].message.content || '{}';
  const result = JSON.parse(raw);

  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const totalTokens = response.usage?.total_tokens || 0;
  const costUsd = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000);

  logger.info({
    participant_id: participantId,
    has_phone: !!result.phone,
    has_email: !!result.email,
    has_telegram: !!result.telegram_link,
    has_company: !!result.company,
    has_position: !!result.position,
    confidence: result.confidence,
    tokens: totalTokens,
    cost_usd: costUsd,
    duration_ms: Date.now() - startTime,
  }, '📇 Contact extraction completed');

  await logOpenAICall({
    orgId, userId,
    requestType: 'participant_contact_extraction',
    model: 'gpt-4o-mini',
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens, costUsd,
    metadata: { participant_id: participantId, participant_name: participantName }
  });

  return {
    phone: result.phone || undefined,
    email: result.email || undefined,
    telegram_link: result.telegram_link || undefined,
    company: result.company || undefined,
    position: result.position || undefined,
    confidence: result.confidence || 0,
    tokens_used: totalTokens,
    cost_usd: costUsd,
  };
}

/**
 * Cost estimation before running analysis
 */
export function estimateAICost(messageCount: number): {
  estimatedTokens: number;
  estimatedCostUsd: number;
  estimatedCostRub: number; // Approx at 95 RUB/USD
} {
  // Rough estimate: ~100 tokens per message (input) + 200 tokens output
  const estimatedTokens = (messageCount * 100) + 200;
  const estimatedCostUsd = (estimatedTokens * 0.15) / 1_000_000; // Pessimistic (all as input tokens)
  const estimatedCostRub = estimatedCostUsd * 95;
  
  return {
    estimatedTokens,
    estimatedCostUsd,
    estimatedCostRub
  };
}

/**
 * Example usage:
 * 
 * const messages = [
 *   { id: '1', text: 'Ищу подрядчика по веб-дизайну...', author_name: 'Иван', created_at: '2025-11-04', is_participant: true },
 *   { id: '2', text: 'Могу помочь! Я дизайнер', author_name: 'Мария', created_at: '2025-11-04', is_participant: false },
 *   ...
 * ];
 * 
 * const result = await analyzeParticipantWithAI(messages, 'Иван', ['дизайн', 'веб-разработка']);
 * 
 * console.log(result.interests_keywords); // ['веб-дизайн', 'UX/UI']
 * console.log(result.recent_asks);        // ['Ищу подрядчика по веб-дизайну']
 * console.log(result.cost_usd);           // 0.0012 (example)
 */

