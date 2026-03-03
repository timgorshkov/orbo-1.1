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
 * Patterns that indicate an introduction / self-presentation message
 */
const INTRO_HASHTAGS = ['#визитка', '#знакомство', '#about', '#мояистория', '#представляюсь', '#новичок'];
const INTRO_PATTERNS = [
  /привет[,!]?\s*(всем[,!]?)?\s*меня зовут/i,
  /добрый день[,!]?\s*я\s+/i,
  /я\s+(?:занимаюсь|работаю|помогаю|основатель|директор|руководитель|фрилансер)/i,
  /моя экспертиза/i,
  /обо мне:/i,
  /расскажу о себе/i,
  /немного о себе/i,
];

/**
 * Detect an introduction/self-presentation message from a list of messages.
 * Returns the message with the highest signal strength.
 */
function detectIntroductionMessage(messages: MessageWithContext[]): MessageWithContext | null {
  let best: MessageWithContext | null = null;
  let bestScore = 0;

  for (const m of messages) {
    if (!m.is_participant) continue;
    const text = m.text;
    let score = 0;

    for (const tag of INTRO_HASHTAGS) {
      if (text.toLowerCase().includes(tag)) score += 3;
    }
    for (const pattern of INTRO_PATTERNS) {
      if (pattern.test(text)) score += 2;
    }
    // Length bonus: real intro messages tend to be longer
    if (text.length > 200) score += 1;
    if (text.length > 500) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return bestScore >= 2 ? best : null;
}

/**
 * Analyze participant's messages with AI
 * 
 * @param messages - Messages with context (last 90 days, prioritize recent)
 * @param participantName - Name of the participant being analyzed
 * @param orgId - Organization ID (for logging)
 * @param userId - User ID who triggered the analysis (for logging)
 * @param participantId - Participant ID (for metadata)
 * @param groupKeywords - Keywords from telegram_groups table (for context)
 * @param reactedMessages - Messages the participant reacted to (interest signals)
 * @returns AI enrichment result
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
    hasGoals?: boolean; // If false, scan full message history for introduction
  }
): Promise<AIEnrichmentResult> {
  const now = new Date();

  // Sort by date (most recent first)
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Limit to last 50 for the main analysis (token efficiency)
  const recentMessages = sortedMessages.slice(0, 50);

  // --- Introduction scan ---
  // Scan ALL available messages (not just last 50) when goals are missing
  const needsIntroScan = !options?.hasGoals;
  const introMessage = needsIntroScan
    ? detectIntroductionMessage(sortedMessages)
    : detectIntroductionMessage(recentMessages);

  // --- Build system prompt ---
  const introSection = introMessage
    ? `
5. **Сообщение-знакомство / визитка** (если найдено):
   Ищи сообщения с хэштегами (#визитка, #знакомство и т.п.) или начинающиеся с "Привет, меня зовут", "Я занимаюсь" и т.п.
   Если такое сообщение есть (оно будет отмечено 🪪), извлеки:
   - "introduction_bio": краткое резюме о человеке (2-3 предложения)
   - "introduction_goals": чего он ищет / что ему нужно от сообщества
   - "introduction_offers": чем может помочь другим (массив строк)
   - "introduction_asks": что ему нужно / его запросы (массив строк)
   Если сообщения-визитки нет — верни все четыре поля как null / [].`
    : '';

  const systemPrompt = `Ты - аналитик сообществ. Твоя задача: проанализировать сообщения участника в группе (Telegram, WhatsApp, MAX) и выделить:

1. **Интересы** (поле "interests", 5-15 элементов):
   Конкретные объекты интереса — всё, что можно назвать по имени: технологии (React, GPT-4, Python), сервисы (Notion, Miro, Stripe), компании и бренды (Яндекс, Сбер, Google), методики (Scrum, Jobs-to-be-Done, JTBD), сферы деятельности с уточнением (e-commerce, EdTech, PropTech, UX/UI, prompt engineering), имена известных людей, названия событий из секции 📅.
   ТАКЖЕ используй события из раздела «Участие в событиях» (📅) — названия событий указывают на интересы участника.
   НЕ включай голые абстракции без предмета: "маркетинг", "продажи", "бизнес" — только если есть конкретный контекст ("performance-маркетинг", "B2B-продажи", "email-маркетинг").
   Если совсем не нашёл ничего предметного — верни [].

2. **Актуальные запросы** (поле "recent_asks", только из последних 1-2 недель):
   Включай ТОЛЬКО существенные запросы: поиск подрядчиков, сотрудников, услуг, инструментов, рекомендаций, профессиональных советов.
   ИСКЛЮЧАЙ: риторические вопросы, реакции на новости/мемы, флуд, смолл-ток ("кто смотрел X?", "что думаете о Y?").
   Примеры хороших запросов: "Ищу дизайнера для лендинга", "Нужен подрядчик по SEO", "Посоветуйте CRM для малого бизнеса".
   Если не нашёл реальных запросов — верни [].

3. **Обсуждаемые темы** (поле "topics_discussed"):
   Широкие тематические категории с подсчётом упоминаний (маркетинг, продажи, HR, дизайн, разработка и т.п.).
   Формат: {"тема": количество_упоминаний}.
   Если участник почти не писал — верни {}.

4. **Город/локация** (если упоминается):
   Уверенность: 0.9 если явно ("Я в Москве"), 0.5 если косвенно ("московские события").${introSection}

**ФОРМАТ СООБЩЕНИЙ:**
- ➡️ - сообщение самого участника (анализируй в первую очередь)
- ↩️ - сообщение, на которое участник отвечал (контекст)
- 🔥 - сообщение, на которое участник поставил реакцию (сигнал интересов)
- 💬 - контекст обсуждения (соседние сообщения)
- 🪪 - сообщение-визитка / знакомство (особо важно для раздела 5)

**ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ:**
- 📅 - события (активность офлайн)
- 📋 - заявки в воронки
- 👤 - данные профиля

**ВАЖНО:**
- interests = конкретные именованные объекты: технологии, сервисы, компании, бренды, конкретные сферы, имена — включай события из 📅 как сигналы интересов
- topics_discussed = широкие тематические категории со статистикой упоминаний
- recent_asks = только реальные деловые/профессиональные запросы
- Возвращай только JSON, без комментариев`;

  const messagesToAnalyze = recentMessages;

  // Build reacted messages section
  const reactedSection = reactedMessages.length > 0
    ? `\n\n--- СООБЩЕНИЯ, НА КОТОРЫЕ УЧАСТНИК ПОСТАВИЛ РЕАКЦИИ ---\n\n${
        reactedMessages.map(r => {
          const authorInfo = r.author ? ` (${r.author})` : '';
          return `🔥 ${r.emoji}${authorInfo}: ${r.text}`;
        }).join('\n\n')
      }`
    : '';

  // Introduction message section (if found and not already in recentMessages)
  let introSection2 = '';
  if (introMessage) {
    const isAlreadyIncluded = messagesToAnalyze.some(m => m.id === introMessage.id);
    if (!isAlreadyIncluded) {
      introSection2 = `\n\n--- СООБЩЕНИЕ-ВИЗИТКА (из истории, за пределами последних 50) ---\n\n🪪 ${introMessage.text.slice(0, 2000)}`;
    }
  }

  // Additional context sections
  let profileSection = '';
  if (additionalContext?.profileContext && additionalContext.profileContext.length > 0) {
    profileSection = `\n\n--- ПРОФИЛЬ УЧАСТНИКА ---\n${additionalContext.profileContext.join('\n')}`;
  }

  let eventsSection = '';
  if (additionalContext?.eventSummary && additionalContext.eventSummary.length > 0) {
    eventsSection = `\n\n--- УЧАСТИЕ В СОБЫТИЯХ ---\n${additionalContext.eventSummary.map(e => `📅 ${e}`).join('\n')}`;
  }

  let applicationsSection = '';
  if (additionalContext?.applicationSummary && additionalContext.applicationSummary.length > 0) {
    applicationsSection = `\n\n--- ЗАЯВКИ ---\n${additionalContext.applicationSummary.map(a => `📋 ${a}`).join('\n')}`;
  }

  const introJsonHint = introMessage
    ? `
- "introduction_bio": строка (краткое резюме кто этот человек, 2-3 предложения) или null
- "introduction_goals": строка (чего ищет в сообществе) или null
- "introduction_offers": массив строк (чем может помочь) или []
- "introduction_asks": массив строк (что нужно) или []`
    : '';

  const userPrompt = `Участник: ${participantName}${profileSection}

Сообщения участника с контекстом (от новых к старым):

${messagesToAnalyze.map((m) => {
  const date = new Date(m.created_at);
  const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  const isIntro = introMessage && m.id === introMessage.id;

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

  const prefix = isIntro ? '🪪' : '➡️';
  messageBlock += `${prefix} [${daysAgo}д назад] ${m.text.slice(0, 500)}${m.text.length > 500 ? '...' : ''}`;

  return messageBlock;
}).join('\n\n')}${introSection2}${reactedSection}${eventsSection}${applicationsSection}

Проанализируй сообщения выше и верни JSON со следующими полями:
- "interests": массив конкретных объектов интереса (5-15 элементов)
- "topics_discussed": объект {"тема": количество_упоминаний} (3-8 тем)
- "recent_asks": массив существенных запросов или []
- "city": строка или null
- "city_confidence": число 0-1 или null${introJsonHint}

Верни ТОЛЬКО валидный JSON.`;

  try {
    const startTime = Date.now();
    
    logger.info({
      participant_id: participantId,
      participant_name: participantName,
      messages_count: messages.length,
      org_id: orgId
    }, '🚀 [OPENAI_CALL] Starting AI enrichment request');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cheaper model, good enough for extraction
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // Low temperature for consistency
      max_tokens: introMessage ? 2000 : 1200,
      response_format: { type: 'json_object' }
    });
    
    const finishReason = response.choices[0]?.finish_reason;
    logger.info({
      participant_id: participantId,
      response_id: response.id,
      model: response.model,
      usage: response.usage,
      finish_reason: finishReason,
    }, '✅ [OPENAI_CALL] Received response from OpenAI');
    
    if (finishReason === 'length') {
      logger.warn({
        participant_id: participantId,
        output_tokens: response.usage?.completion_tokens,
      }, '⚠️ [OPENAI_CALL] Response truncated (finish_reason=length), output may be incomplete');
    }
    
    const rawResponse = response.choices[0].message.content || '{}';
    const result = JSON.parse(rawResponse);
    
    // Calculate cost (gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output)
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;
    const costUsd = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000);
    
    logger.info({ 
      participant_id: participantId,
      participant_name: participantName,
      messages_count: messages.length,
      interests_count: result.interests?.length || 0,
      topics_count: Object.keys(result.topics_discussed || {}).length,
      asks_count: result.recent_asks?.length || 0,
      has_intro_bio: !!result.introduction_bio,
      total_tokens: totalTokens,
      cost_usd: costUsd,
      output_tokens: outputTokens,
    }, 'AI enrichment completed');
    
    logger.debug({
      participant_id: participantId,
      raw_interests: result.interests,
      raw_topics: result.topics_discussed,
      raw_asks: result.recent_asks,
    }, 'AI enrichment raw result');
    
    // ⭐ Log API call to database
    await logOpenAICall({
      orgId,
      userId,
      requestType: 'participant_enrichment',
      model: 'gpt-4o-mini',
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens,
      costUsd,
      metadata: {
        participant_id: participantId,
        participant_name: participantName,
        message_count: messages.length,
        analysis_duration_ms: Date.now() - startTime
      }
    });
    
    return {
      interests_keywords: result.interests || [],
      topics_discussed: result.topics_discussed || {},
      recent_asks: result.recent_asks || [],
      city_inferred: result.city || undefined,
      city_confidence: result.city_confidence || undefined,

      introduction_raw: introMessage?.text || undefined,
      introduction_bio: result.introduction_bio || undefined,
      introduction_goals: result.introduction_goals || undefined,
      introduction_offers: Array.isArray(result.introduction_offers) ? result.introduction_offers : undefined,
      introduction_asks: Array.isArray(result.introduction_asks) ? result.introduction_asks : undefined,

      tokens_used: totalTokens,
      cost_usd: costUsd,
      analysis_date: new Date().toISOString()
    };
  } catch (error) {
    // Determine error type for better diagnostics
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
      error_name: error instanceof Error ? error.name : undefined,
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

