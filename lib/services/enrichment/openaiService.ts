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
  interests_keywords: string[];          // Top interests/expertise
  topics_discussed: Record<string, number>; // Topic -> mention count
  recent_asks: string[];                 // Recent questions/requests (last 1-2 weeks)
  city_inferred?: string;                // City if mentioned
  city_confidence?: number;              // 0-1 confidence
  
  // Meta
  tokens_used: number;
  cost_usd: number;
  analysis_date: string;
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
  }
): Promise<AIEnrichmentResult> {
  // ⚠️ Don't filter by date - imported history may have old dates
  // Use all available messages, but prioritize recent ones
  const now = new Date();
  
  // Sort by date (most recent first) - this ensures recent messages are analyzed first
  const sortedMessages = [...messages].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Use all messages, but limit to last 50 for token efficiency
  // This allows analyzing imported history with old dates
  const recentMessages = sortedMessages.slice(0, 50);
  
  // Prepare prompt
  const systemPrompt = `Ты - аналитик сообществ. Твоя задача: проанализировать сообщения участника в Telegram-группе и выделить:

1. **Интересы и экспертизу** (5-10 ключевых слов/фраз):
   - О чём участник чаще всего говорит в своих сообщениях
   - В каких темах проявляет экспертизу (даёт советы, делится опытом, упоминает профессиональные термины)
   - Только существительные или короткие фразы (например: "PPC", "веб-дизайн", "Python", "event-менеджмент", "маркетинг", "программирование")
   - Можешь включать общие темы, если они часто упоминаются ("работа", "бизнес", "обучение")
   - Если участник упоминает конкретные технологии, инструменты, навыки - включи их
   - Даже если сообщения короткие, попробуй найти хотя бы 2-3 интереса
   - Если участник написал очень мало (<3 сообщений) - верни пустой массив []

2. **Актуальные запросы/вопросы** (последние 1-2 недели):
   - Что участник ищет или спрашивает в своих сообщениях
   - Формулируй кратко (1-2 предложения на запрос)
   - Включай как явные вопросы ("Где найти...?", "Как сделать...?"), так и неявные запросы ("Нужен...", "Ищу...")
   - Если не нашёл запросов - верни пустой массив []

3. **Обсуждаемые темы** (topics_discussed):
   - Темы, которые участник упоминает в своих сообщениях
   - Подсчитай сколько раз участник упоминал каждую тему
   - Включай даже общие темы, если они упоминаются часто
   - Если участник почти не писал - верни пустой объект {}

4. **Город/локация** (если упоминается):
   - Определи город, если участник его упомянул
   - Уверенность: 0.9 если явно указал ("Я в Москве"), 0.5 если косвенно ("московские события")

**ФОРМАТ СООБЩЕНИЙ:**
- ➡️ - сообщение самого участника (анализируй в первую очередь)
- ↩️ - сообщение, на которое участник отвечал (используй как контекст для понимания темы)
- 🔥 - сообщение, на которое участник поставил реакцию (сигнал об интересах)
- 💬 - контекст обсуждения (соседние сообщения в треде)

**ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ:**
- 📅 - события, на которые участник зарегистрировался/пришёл (показывает его активность в офлайне)
- 📋 - заявки участника в воронках (вступление, услуги)
- 👤 - данные профиля (биография, компания, должность)

**ВАЖНО:**
- Используй контекст ответов и реакций для более точного определения интересов
- Если участник отвечает на вопрос о Python - значит он интересуется/разбирается в Python
- Если участник ставит 🔥 на пост о маркетинге - это сигнал интереса к маркетингу
- Учитывай события и заявки как дополнительные сигналы интересов и вовлечённости
- Данные профиля (компания, должность) - важны для определения экспертизы
- Фокус на последние 2 недели для "актуальных запросов"
- Интересы - из всего периода, но с приоритетом на свежие
- Возвращай только данные в формате JSON, без комментариев`;

  const messagesToAnalyze = recentMessages.slice(0, 50);
  
  // Build reacted messages section if available
  const reactedSection = reactedMessages.length > 0 
    ? `\n\n--- СООБЩЕНИЯ, НА КОТОРЫЕ УЧАСТНИК ПОСТАВИЛ РЕАКЦИИ (сигнал интересов) ---\n\n${
        reactedMessages.map(r => {
          const authorInfo = r.author ? ` (${r.author})` : '';
          return `🔥 ${r.emoji}${authorInfo}: ${r.text}`;
        }).join('\n\n')
      }`
    : '';

  // Build additional context sections (compact, token-efficient)
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

  const userPrompt = `Участник: ${participantName}${profileSection}

Сообщения участника с контекстом (от новых к старым):

${messagesToAnalyze.map((m, i) => {
  const date = new Date(m.created_at);
  const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  let messageBlock = '';
  
  // Добавляем контекст ответа (если есть)
  if (m.reply_to_text) {
    const authorInfo = m.reply_to_author ? ` (${m.reply_to_author})` : '';
    messageBlock += `↩️${authorInfo}: ${m.reply_to_text.slice(0, 200)}${m.reply_to_text.length > 200 ? '...' : ''}\n`;
  }
  
  // Добавляем контекст треда (если есть)
  if (m.thread_context && m.thread_context.length > 0) {
    m.thread_context.forEach(ctx => {
      messageBlock += `💬 ${ctx.slice(0, 150)}${ctx.length > 150 ? '...' : ''}\n`;
    });
  }
  
  // Само сообщение участника
  messageBlock += `➡️ [${daysAgo}д назад] ${m.text.slice(0, 500)}${m.text.length > 500 ? '...' : ''}`;
  
  return messageBlock;
}).join('\n\n')}${reactedSection}${eventsSection}${applicationsSection}

Верни результат строго в формате JSON:
{
  "interests": ["интерес1", "интерес2", ...],
  "topics_discussed": {"тема1": количество_упоминаний, "тема2": ...},
  "recent_asks": ["запрос1", "запрос2", ...],
  "city": "Город" или null,
  "city_confidence": 0.0-1.0 или null
}`;

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
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });
    
    logger.info({
      participant_id: participantId,
      response_id: response.id,
      model: response.model,
      usage: response.usage
    }, '✅ [OPENAI_CALL] Received response from OpenAI');
    
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
      total_tokens: totalTokens,
      cost_usd: costUsd
    }, 'AI enrichment completed');
    
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
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorType = 'rate_limit';
        errorDetails.hint = 'OpenAI rate limit exceeded, try again later';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorType = 'blocked';
        errorDetails.hint = 'Access blocked, check proxy configuration';
      }
    }
    
    logger.error({ 
      participant_id: participantId,
      participant_name: participantName,
      org_id: orgId,
      error_type: errorType,
      error: error instanceof Error ? error.message : String(error),
      error_name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      ...errorDetails
    }, `❌ [OPENAI_CALL] AI enrichment failed: ${errorType}`);
    throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

