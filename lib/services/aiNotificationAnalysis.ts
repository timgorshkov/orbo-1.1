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

/**
 * Analyze messages for negativity (conflicts, rudeness, aggression)
 */
export async function analyzeNegativeContent(
  messages: Message[],
  orgId: string,
  ruleId: string,
  severityThreshold: 'low' | 'medium' | 'high' = 'medium'
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

  const systemPrompt = `Ты - модератор сообщества. Проанализируй сообщения на предмет негатива и недовольства.

Критерии негатива (ищи любые из перечисленных признаков):
1. Явный негатив:
   - Ругань, мат, оскорбления
   - Агрессивная тональность, угрозы
   - Конфликты между участниками
   - Токсичное поведение

2. Скрытый негатив и недовольство (важно!):
   - Жалобы на игнорирование: "Почему никто не отвечает", "Меня игнорируют"
   - Выражения разочарования: "Опять это не работает", "Как всегда..."
   - Пассивная агрессия: сарказм, язвительность
   - Риторические вопросы с недовольством: "И что мне теперь делать?!"
   - Претензии к организации/участникам

Примеры негатива разной серьёзности:
- low: "Почему никто не реагирует!", "Опять задержка", "Это уже не первый раз"
- medium: "Вы вообще читаете сообщения?", "Надоело ждать", "Полный бардак"
- high: Оскорбления, угрозы, прямая агрессия

Определи серьёзность (severity):
- "low" - недовольство, раздражение, жалобы
- "medium" - явный конфликт, грубость, резкие претензии
- "high" - серьёзные оскорбления, угрозы, агрессия

ВАЖНО: Если видишь признаки недовольства, жалобы или претензии - это негатив уровня "low" минимум!

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
    severity_threshold: severityThreshold
  }, '🔄 [AI-ANALYSIS] Starting negativity analysis');

  try {
    logger.info({
      rule_id: ruleId,
      model: 'gpt-4o-mini',
      messages_sample: messages.slice(0, 2).map(m => ({ author: m.author_name, text: m.text.slice(0, 50) }))
    }, '📞 [AI-ANALYSIS] Calling OpenAI API');
    
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

    logger.info({
      rule_id: ruleId,
      has_response: !!completion.choices[0]?.message?.content,
      usage: completion.usage
    }, '✅ [AI-ANALYSIS] OpenAI API response received');

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('Empty AI response');
    }

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
      problematic_indices: result.problematic_indices,
      raw_response: responseText.slice(0, 500), // First 500 chars for debugging
      tokens: totalTokens,
      cost_usd: costUsd
    }, '📊 [AI-ANALYSIS] Analysis result');

    // Log API call
    await logAICall({
      orgId,
      ruleId,
      requestType: 'notification_negativity',
      model: 'gpt-4o-mini',
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      metadata: { messages_count: messages.length }
    });

    // Get sample messages based on problematic indices
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
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      rule_id: ruleId,
      org_id: orgId
    }, '❌ [AI-ANALYSIS] Negativity analysis failed');
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
  timeoutHours: number = 2
): Promise<UnansweredQuestionsResult> {
  if (messages.length === 0) {
    return {
      questions: [],
      tokens_used: 0,
      cost_usd: 0,
    };
  }

  logger.info({
    rule_id: ruleId,
    org_id: orgId,
    messages_count: messages.length,
    timeout_hours: timeoutHours
  }, '🔄 [AI-ANALYSIS] Starting unanswered questions analysis');

  const systemPrompt = `Ты - аналитик сообщества. Найди вопросы, которые остались без ответа.

Критерии вопроса:
- Явный вопрос (с "?")
- Просьба о помощи ("подскажите", "помогите", "кто знает")
- Запрос информации ("где найти", "как сделать")

Критерии ответа:
- Сообщение после вопроса от другого участника
- Содержит полезную информацию или ссылку
- Явно обращено к автору вопроса

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
    logger.info({
      rule_id: ruleId,
      model: 'gpt-4o-mini',
      messages_sample: messages.slice(0, 2).map(m => ({ author: m.author_name, text: m.text.slice(0, 50) }))
    }, '📞 [AI-ANALYSIS] Calling OpenAI API for questions');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' }
    });

    logger.info({
      rule_id: ruleId,
      has_response: !!completion.choices[0]?.message?.content,
      usage: completion.usage
    }, '✅ [AI-ANALYSIS] OpenAI API response received for questions');

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('Empty AI response');
    }

    const result = JSON.parse(responseText);
    const promptTokens = completion.usage?.prompt_tokens || 0;
    const completionTokens = completion.usage?.completion_tokens || 0;
    const totalTokens = completion.usage?.total_tokens || 0;
    const costUsd = calculateCost(promptTokens, completionTokens);

    // Log API call
    await logAICall({
      orgId,
      ruleId,
      requestType: 'notification_questions',
      model: 'gpt-4o-mini',
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      metadata: { messages_count: messages.length, timeout_hours: timeoutHours }
    });

    // Transform results
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

    return {
      questions,
      tokens_used: totalTokens,
      cost_usd: costUsd,
    };
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      rule_id: ruleId,
      org_id: orgId
    }, '❌ [AI-ANALYSIS] Questions analysis failed');
    return {
      questions: [],
      tokens_used: 0,
      cost_usd: 0,
    };
  }
}

