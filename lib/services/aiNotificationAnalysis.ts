/**
 * AI Notification Analysis Service
 * 
 * Uses GPT-4o-mini to analyze messages for:
 * - Negativity detection (conflicts, rudeness, aggressive tone)
 * - Unanswered questions detection
 * 
 * All API calls are logged to openai_api_logs with feature='notifications'
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { openai } from './openaiClient';
import { createServiceLogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

const logger = createServiceLogger('AINotificationAnalysis');

const supabaseAdmin = createAdminServer();

// Cost calculation for gpt-4o-mini
const COST_PER_1M_INPUT = 0.15;  // $0.15 per 1M input tokens
const COST_PER_1M_OUTPUT = 0.60; // $0.60 per 1M output tokens

interface Message {
  id: string;
  text: string;
  author_name: string;
  author_id: string;
  created_at: string;
  has_reply?: boolean;
}

export interface NegativeAnalysisResult {
  has_negative: boolean;
  severity: 'low' | 'medium' | 'high';
  summary: string;
  sample_messages: string[];
  tokens_used: number;
  cost_usd: number;
}

export interface UnansweredQuestionsResult {
  questions: Array<{
    text: string;
    author: string;
    author_id: string;
    timestamp: string;
    answered: boolean;
  }>;
  tokens_used: number;
  cost_usd: number;
}

/**
 * Log AI API call to database
 */
async function logAICall(params: {
  orgId: string;
  ruleId: string;
  requestType: 'notification_negativity' | 'notification_questions';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const costRub = params.costUsd * 95;
    
    const { error } = await supabaseAdmin
      .from('openai_api_logs')
      .insert({
        org_id: params.orgId,
        created_by: null, // System/cron
        request_type: params.requestType,
        model: params.model,
        prompt_tokens: params.promptTokens,
        completion_tokens: params.completionTokens,
        total_tokens: params.totalTokens,
        cost_usd: params.costUsd,
        cost_rub: costRub,
        metadata: {
          ...params.metadata,
          feature: 'notifications',
          rule_id: params.ruleId,
        }
      });
    
    if (error) {
      logger.error({ error: error.message, rule_id: params.ruleId }, 'Failed to log AI call');
    }
  } catch (err) {
    logger.error({ error: err }, 'Exception logging AI call');
  }
}

/**
 * Calculate cost from token usage
 */
function calculateCost(promptTokens: number, completionTokens: number): number {
  const inputCost = (promptTokens / 1_000_000) * COST_PER_1M_INPUT;
  const outputCost = (completionTokens / 1_000_000) * COST_PER_1M_OUTPUT;
  return inputCost + outputCost;
}

// ─── Sensitivity helpers ──────────────────────────────────────────────────────

/**
 * Derive sensitivity level (1-5) from legacy string threshold or stored integer.
 * 1 = minimal, 3 = normal (default), 5 = maximum.
 */
export function resolveSensitivity(
  sensitivity?: number | null,
  legacyThreshold?: 'low' | 'medium' | 'high' | null
): number {
  if (typeof sensitivity === 'number' && sensitivity >= 1 && sensitivity <= 5) return sensitivity;
  // Backwards-compat mapping
  if (legacyThreshold === 'high') return 2;
  if (legacyThreshold === 'medium') return 3;
  if (legacyThreshold === 'low') return 4;
  return 3;
}

function negativitySensitivityInstructions(level: number): string {
  switch (level) {
    case 1:
      return 'Реагируй ТОЛЬКО на экстремальные случаи: прямые угрозы, тяжёлые оскорбления, открытую агрессию. Обсуждение новостей, лёгкое недовольство, эмоциональные восклицания — игнорируй.';
    case 2:
      return 'Реагируй на явные конфликты: оскорбления, агрессивное поведение, открытые претензии. Лёгкое раздражение или эмоциональность — не считай негативом.';
    case 3:
      return 'Реагируй на заметный негатив: жалобы, недовольство, пассивная агрессия, риторические претензии. Это стандартный уровень чувствительности.';
    case 4:
      return 'Реагируй также на скрытое недовольство: тонкий сарказм, разочарование, осторожные жалобы, риторические вопросы с негативным оттенком.';
    case 5:
      return 'Максимальная чувствительность: отмечай любой намёк на раздражение, лёгкую фрустрацию, нейтральные вопросы с негативным подтекстом. Лучше лишний раз уведомить.';
    default:
      return '';
  }
}

function questionSensitivityInstructions(level: number): string {
  switch (level) {
    case 1:
    case 2:
      return 'Учитывай ТОЛЬКО явные вопросы (знак "?") и прямые просьбы о помощи. Не включай неявные и косвенные запросы.';
    case 3:
      return 'Учитывай явные вопросы, просьбы о помощи и запросы информации. Стандартный уровень.';
    case 4:
      return 'Учитывай также неявные запросы: утверждения, ожидающие фидбека, приглашения к диалогу, открытые высказывания требующие реакции.';
    case 5:
      return 'Максимальная чувствительность: любой запрос, даже косвенный, который может ожидать ответа от участников.';
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze messages for negativity (conflicts, rudeness, aggression)
 */
export async function analyzeNegativeContent(
  messages: Message[],
  orgId: string,
  ruleId: string,
  severityThreshold: 'low' | 'medium' | 'high' = 'medium',
  sensitivity?: number | null,
  customPrompt?: string | null
): Promise<NegativeAnalysisResult> {
  if (messages.length === 0) {
    return {
      has_negative: false,
      severity: 'low',
      summary: '',
      sample_messages: [],
      tokens_used: 0,
      cost_usd: 0,
    };
  }

  const sensitivityLevel = resolveSensitivity(sensitivity, severityThreshold);
  const sensitivityNote = negativitySensitivityInstructions(sensitivityLevel);

  const customNote = customPrompt
    ? `\n\nДополнительные инструкции от администратора:\n${customPrompt}`
    : '';

  const systemPrompt = `Ты - модератор сообщества. Проанализируй сообщения на предмет негатива и недовольства.

Критерии негатива:
1. Явный негатив:
   - Ругань, мат, оскорбления
   - Агрессивная тональность, угрозы
   - Конфликты между участниками
   - Токсичное поведение

2. Скрытый негатив и недовольство:
   - Жалобы на игнорирование: "Почему никто не отвечает"
   - Выражения разочарования: "Опять это не работает", "Как всегда..."
   - Пассивная агрессия: сарказм, язвительность
   - Риторические вопросы с недовольством: "И что мне теперь делать?!"
   - Претензии к организации/участникам

Определи серьёзность (severity):
- "low" - недовольство, раздражение, жалобы
- "medium" - явный конфликт, грубость, резкие претензии
- "high" - серьёзные оскорбления, угрозы, агрессия

УРОВЕНЬ ЧУВСТВИТЕЛЬНОСТИ: ${sensitivityLevel}/5
${sensitivityNote}${customNote}

Верни JSON:
{
  "has_negative": boolean,
  "severity": "low" | "medium" | "high",
  "summary": "краткое описание ситуации (1-2 предложения)",
  "problematic_indices": [индексы проблемных сообщений]
}`;

  const userPrompt = `Проанализируй последние сообщения в чате:

${messages.map((m, i) => `[${i}] ${m.author_name}: ${m.text.slice(0, 300)}${m.text.length > 300 ? '...' : ''}`).join('\n')}

Порог серьёзности: "${severityThreshold}" (уведомлять только при >= этого уровня)`;

  logger.info({
    rule_id: ruleId,
    org_id: orgId,
    messages_count: messages.length,
    severity_threshold: severityThreshold,
    sensitivity: sensitivityLevel,
  }, '🔄 [AI-ANALYSIS] Starting negativity analysis');

  try {
    logger.info({ rule_id: ruleId, model: 'gpt-4o-mini' }, '📞 [AI-ANALYSIS] Calling OpenAI API');
    logger.debug({
      rule_id: ruleId,
      messages_sample: messages.slice(0, 2).map(m => ({ author: m.author_name, text: m.text.slice(0, 50) }))
    }, '📞 [AI-ANALYSIS] Messages sample');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error('Empty AI response');

    const result = JSON.parse(responseText);
    const promptTokens = completion.usage?.prompt_tokens || 0;
    const completionTokens = completion.usage?.completion_tokens || 0;
    const totalTokens = completion.usage?.total_tokens || 0;
    const costUsd = calculateCost(promptTokens, completionTokens);

    logger.info({
      rule_id: ruleId,
      has_negative: result.has_negative,
      severity: result.severity,
      summary: result.summary,
      tokens: totalTokens,
      cost_usd: costUsd
    }, '📊 [AI-ANALYSIS] Analysis result');

    await logAICall({
      orgId, ruleId,
      requestType: 'notification_negativity',
      model: 'gpt-4o-mini',
      promptTokens, completionTokens, totalTokens, costUsd,
      metadata: { messages_count: messages.length, sensitivity: sensitivityLevel }
    });

    const problematicIndices = result.problematic_indices || [];
    const sampleMessages = problematicIndices
      .slice(0, 3)
      .map((i: number) => messages[i]?.text.slice(0, 100))
      .filter(Boolean);

    return {
      has_negative: result.has_negative,
      severity: result.severity,
      summary: result.summary || '',
      sample_messages: sampleMessages,
      tokens_used: totalTokens,
      cost_usd: costUsd,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const is429 = errMsg.includes('429') || errMsg.toLowerCase().includes('quota');
    logger.error({
      error: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
      rule_id: ruleId,
      org_id: orgId
    }, '❌ [AI-ANALYSIS] Negativity analysis failed');
    if (is429) {
      await logErrorToDatabase({
        level: 'error',
        message: 'OpenAI quota exceeded (429) in AI notification analysis',
        errorCode: 'OPENAI_QUOTA_EXCEEDED',
        context: { service: 'AINotificationAnalysis', rule_id: ruleId, error: errMsg },
        stackTrace: error instanceof Error ? error.stack : undefined,
        orgId,
      }).catch(() => {});
    }
    return {
      has_negative: false,
      severity: 'low',
      summary: 'Ошибка анализа',
      sample_messages: [],
      tokens_used: 0,
      cost_usd: 0,
    };
  }
}

/**
 * Analyze messages for unanswered questions
 */
export async function analyzeUnansweredQuestions(
  messages: Message[],
  orgId: string,
  ruleId: string,
  timeoutHours: number = 2,
  sensitivity?: number | null,
  customPrompt?: string | null
): Promise<UnansweredQuestionsResult> {
  if (messages.length === 0) {
    return { questions: [], tokens_used: 0, cost_usd: 0 };
  }

  const sensitivityLevel = resolveSensitivity(sensitivity, null);
  const sensitivityNote = questionSensitivityInstructions(sensitivityLevel);
  const customNote = customPrompt
    ? `\n\nДополнительные инструкции от администратора:\n${customPrompt}`
    : '';

  logger.info({
    rule_id: ruleId,
    org_id: orgId,
    messages_count: messages.length,
    timeout_hours: timeoutHours,
    sensitivity: sensitivityLevel,
  }, '🔄 [AI-ANALYSIS] Starting unanswered questions analysis');

  const systemPrompt = `Ты - аналитик сообщества. Найди вопросы, которые остались без ответа.

Критерии вопроса:
- Явный вопрос (с "?")
- Просьба о помощи ("подскажите", "помогите", "кто знает")
- Запрос информации ("где найти", "как сделать")

ВАЖНО — критерии ответа (не только технический reply!):
Ответ НЕ обязан быть техническим reply на сообщение.
Если в СЛЕДУЮЩИХ 3-5 сообщениях в диалоге кто-то другой:
  - Содержательно отвечает на тему вопроса
  - Предлагает полезную информацию, ссылку, рекомендацию
  - Явно обращается к автору вопроса
— считай вопрос ОТВЕЧЕННЫМ, даже без технического reply.

Примеры:
- [3] Автор А: "Кто знает хорошего бухгалтера?"
  [5] Автор Б: "Могу порекомендовать Ивана, он ведёт несколько компаний"
  → ОТВЕЧЕН (тематический ответ, не reply)

- [7] Автор В: "Как настроить CI/CD для монорепы?"
  [8-12] Другие авторы: флуд не по теме
  → НЕ ОТВЕЧЕН

УРОВЕНЬ ЧУВСТВИТЕЛЬНОСТИ: ${sensitivityLevel}/5
${sensitivityNote}${customNote}

Верни JSON:
{
  "questions": [
    {
      "index": индекс_сообщения,
      "answered": true/false,
      "question_summary": "краткий пересказ вопроса"
    }
  ]
}`;

  const userPrompt = `Проанализируй сообщения и найди неотвеченные вопросы:

${messages.map((m, i) => `[${i}] ${m.author_name} (${new Date(m.created_at).toLocaleTimeString('ru')}): ${m.text.slice(0, 200)}${m.text.length > 200 ? '...' : ''}`).join('\n')}

Таймаут ответа: ${timeoutHours} часов`;

  try {
    logger.info({ rule_id: ruleId, model: 'gpt-4o-mini' }, '📞 [AI-ANALYSIS] Calling OpenAI API for questions');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    logger.debug({
      rule_id: ruleId,
      has_response: !!completion.choices[0]?.message?.content,
      total_tokens: completion.usage?.total_tokens
    }, '✅ [AI-ANALYSIS] OpenAI API response received for questions');

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error('Empty AI response');

    const result = JSON.parse(responseText);
    const promptTokens = completion.usage?.prompt_tokens || 0;
    const completionTokens = completion.usage?.completion_tokens || 0;
    const totalTokens = completion.usage?.total_tokens || 0;
    const costUsd = calculateCost(promptTokens, completionTokens);

    await logAICall({
      orgId, ruleId,
      requestType: 'notification_questions',
      model: 'gpt-4o-mini',
      promptTokens, completionTokens, totalTokens, costUsd,
      metadata: { messages_count: messages.length, timeout_hours: timeoutHours, sensitivity: sensitivityLevel }
    });

    const questions = (result.questions || [])
      .filter((q: { answered: boolean }) => !q.answered)
      .map((q: { index: number; question_summary: string }) => {
        const msg = messages[q.index];
        if (!msg) return null;
        return {
          text: q.question_summary || msg.text.slice(0, 100),
          author: msg.author_name,
          author_id: msg.author_id,
          timestamp: msg.created_at,
          answered: false,
        };
      })
      .filter(Boolean);

    logger.info({
      rule_id: ruleId,
      unanswered_count: questions.length,
      tokens: totalTokens,
      cost_usd: costUsd
    }, '📊 [AI-ANALYSIS] Questions analysis result');

    return { questions, tokens_used: totalTokens, cost_usd: costUsd };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      rule_id: ruleId,
      org_id: orgId
    }, '❌ [AI-ANALYSIS] Questions analysis failed');
    return { questions: [], tokens_used: 0, cost_usd: 0 };
  }
}

