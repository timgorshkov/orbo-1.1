/**
 * OpenAI Service for Participant Enrichment
 * 
 * Uses ChatGPT API to extract:
 * - Interests and expertise areas
 * - Recent asks/questions
 * - City/location (if mentioned)
 * 
 * Cost-conscious: Only runs on demand (manual trigger by owner)
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Message with context for AI analysis
 */
interface MessageWithContext {
  id: string;
  text: string;
  author_name: string;
  created_at: string;
  is_participant: boolean; // true if this message is from the analyzed participant
  context_before?: string; // Previous messages for context
  context_after?: string;  // Next messages for context
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
 * @param groupKeywords - Keywords from telegram_groups table (for context)
 * @returns AI enrichment result
 */
export async function analyzeParticipantWithAI(
  messages: MessageWithContext[],
  participantName: string,
  groupKeywords: string[] = []
): Promise<AIEnrichmentResult> {
  // Filter messages from the last 90 days, prioritize last 14 days
  const now = new Date();
  const recentMessages = messages.filter(m => {
    const msgDate = new Date(m.created_at);
    const daysAgo = (now.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 90;
  });
  
  // Sort by date (most recent first)
  recentMessages.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Prepare prompt
  const systemPrompt = `Ты - аналитик сообществ. Твоя задача: проанализировать сообщения участника в Telegram-группе и выделить:

1. **Интересы и экспертизу** (5-10 ключевых слов/фраз):
   - О чём участник чаще всего говорит В СВОИХ СООБЩЕНИЯХ (помечены ➡️)
   - В каких темах проявляет экспертизу (даёт советы, делится опытом)
   - Только существительные или короткие фразы (например: "PPC", "веб-дизайн", "Python", "event-менеджмент")
   - Исключи общие слова ("работа", "вопрос", "помощь", "группа", "чат")
   - АНАЛИЗИРУЙ ТОЛЬКО сообщения самого участника (➡️), НЕ анализируй сообщения других
   - Если участник написал мало (<3 сообщений) - верни пустой массив []

2. **Актуальные запросы/вопросы** (последние 1-2 недели):
   - Что участник ищет или спрашивает В СВОИХ СООБЩЕНИЯХ (помечены ➡️)
   - Формулируй кратко (1-2 предложения на запрос)
   - Только если это явный запрос/вопрос ОТ ЭТОГО участника
   - Если не нашёл запросов - верни пустой массив []

3. **Обсуждаемые темы** (topics_discussed):
   - Темы, которые участник упоминает В СВОИХ сообщениях (помечены ➡️)
   - Подсчитай сколько раз участник упоминал каждую тему
   - НЕ считай темы из сообщений других людей (без ➡️)
   - Если участник почти не писал - верни пустой объект {}

4. **Город/локация** (если упоминается):
   - Определи город, если участник его упомянул В СВОИХ сообщениях (➡️)
   - Уверенность: 0.9 если явно указал ("Я в Москве"), 0.5 если косвенно ("московские события")

**КРИТИЧЕСКИ ВАЖНО:**
- Анализируй ТОЛЬКО сообщения самого участника (помечены ➡️ в начале строки)
- НЕ используй темы из сообщений других участников (без ➡️)
- Фокус на последние 2 недели для "актуальных запросов"
- Интересы - из всего периода, но с приоритетом на свежие
- Игнорируй служебные сообщения, приветствия, благодарности
- Если участник написал мало - верни минимум данных
- Возвращай только данные, без комментариев`;

  const userPrompt = `Участник: ${participantName}

Сообщения (от новых к старым):

${recentMessages.slice(0, 50).map((m, i) => {
  const date = new Date(m.created_at);
  const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  const marker = m.is_participant ? '➡️' : '  ';
  return `${marker} [${daysAgo}д назад] ${m.author_name}: ${m.text.slice(0, 300)}${m.text.length > 300 ? '...' : ''}`;
}).join('\n\n')}

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
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Calculate cost (gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output)
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;
    const costUsd = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000);
    
    console.log(`[AI Enrichment] Analyzed ${messages.length} messages in ${Date.now() - startTime}ms`);
    console.log(`[AI Enrichment] Tokens: ${totalTokens}, Cost: $${costUsd.toFixed(4)}`);
    
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
    console.error('[AI Enrichment] Error:', error);
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

