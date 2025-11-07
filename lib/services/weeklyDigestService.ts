/**
 * Weekly Digest Service
 * 
 * Generates AI-powered weekly digest for community admins.
 * Uses hybrid approach: rule-based logic + AI enhancements.
 * 
 * Cost: ~$0.002-0.003 per digest (2 OpenAI calls)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { createServiceLogger } from '@/lib/logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const logger = createServiceLogger('WeeklyDigestService');

// ===== TYPES =====

interface DigestData {
  org_id: string;
  generated_at: string;
  key_metrics: {
    current: {
      active_participants: number;
      messages: number;
      replies: number;
      reactions: number;
    };
    previous: {
      active_participants: number;
      messages: number;
      replies: number;
      reactions: number;
    };
  };
  attention_zones: {
    inactive_newcomers: number;
    silent_members: number;
  };
  upcoming_events: Array<{
    id: string;
    title: string;
    start_time: string;
    location?: string;
    registration_count: number;
  }>;
  message_count: number;
  ai_analysis_eligible: boolean;
}

interface AIInsights {
  activity_comment: string;
  contributors_comment: string;
  attention_comment?: string;
  events_comment?: string;
}

interface SuggestedAction {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionType: 'message_newcomers' | 'promote_event' | 'engage_silent' | 'highlight_contributor' | 'other';
}

interface TopContributor {
  name: string;
  messages: number;
  reactions_received: number;
  rank_change?: number;
  is_new_to_top?: boolean;
}

export interface WeeklyDigest {
  orgId: string;
  orgName: string;
  dateRange: {
    start: string;
    end: string;
  };
  keyMetrics: DigestData['key_metrics'];
  topContributors: TopContributor[];
  attentionZones: DigestData['attention_zones'];
  upcomingEvents: DigestData['upcoming_events'];
  aiInsights: AIInsights;
  suggestedActions: SuggestedAction[];
  cost: {
    totalUsd: number;
    totalRub: number;
  };
}

// ===== MAIN FUNCTION =====

/**
 * Generate complete weekly digest with AI insights
 */
export async function generateWeeklyDigest(
  orgId: string,
  userId: string | null = null
): Promise<WeeklyDigest> {
  const startTime = Date.now();

  // 1. Fetch digest data from RPC
  const { data: digestData, error: rpcError } = await supabaseAdmin
    .rpc('generate_weekly_digest_data', { p_org_id: orgId });

  if (rpcError || !digestData) {
    throw new Error(`Failed to fetch digest data: ${rpcError?.message || 'No data'}`);
  }

  // 2. Get organization info
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  // 3. Fetch top contributors (past 7 days)
  const topContributors = await fetchTopContributors(orgId);

  // 4. Generate AI insights (if eligible)
  let aiInsights: AIInsights;
  let totalCostUsd = 0;

  if (digestData.ai_analysis_eligible) {
    const { insights, costUsd } = await generateAIInsights(digestData, topContributors);
    aiInsights = insights;
    totalCostUsd += costUsd;
  } else {
    // Fallback: minimal insights without AI
    aiInsights = {
      activity_comment: 'Недостаточно данных для AI-анализа (требуется минимум 20 сообщений за неделю).',
      contributors_comment: ''
    };
  }

  // 5. Generate suggested actions (rules + AI)
  const { actions, costUsd: actionsCost } = await generateSuggestedActions(
    digestData,
    topContributors,
    aiInsights,
    digestData.ai_analysis_eligible
  );
  totalCostUsd += actionsCost;

  // 6. Log OpenAI usage
  if (totalCostUsd > 0) {
    await logDigestGeneration(orgId, userId, totalCostUsd, Date.now() - startTime);
  }

  // 7. Calculate date range
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    orgId,
    orgName: org?.name || 'Организация',
    dateRange: {
      start: sevenDaysAgo.toISOString(),
      end: now.toISOString()
    },
    keyMetrics: digestData.key_metrics,
    topContributors,
    attentionZones: digestData.attention_zones,
    upcomingEvents: digestData.upcoming_events,
    aiInsights,
    suggestedActions: actions,
    cost: {
      totalUsd: totalCostUsd,
      totalRub: totalCostUsd * 95
    }
  };
}

// ===== HELPER FUNCTIONS =====

/**
 * Fetch top 3 contributors for the past 7 days
 */
async function fetchTopContributors(orgId: string): Promise<TopContributor[]> {
  const { data, error } = await supabaseAdmin
    .rpc('get_top_contributors', {
      p_org_id: orgId,
      p_limit: 3,
      p_tg_chat_id: null
    });

  if (error || !data) {
    logger.warn({ error }, 'Failed to fetch top contributors');
    return [];
  }

  return data.map((contributor: any) => ({
    name: contributor.full_name || contributor.username || 'Участник',
    messages: contributor.current_week_score || 0,
    reactions_received: 0, // TODO: Add if available
    rank_change: contributor.rank_change,
    is_new_to_top: contributor.rank_label === 'NEW'
  }));
}

/**
 * Generate AI insights using OpenAI
 * Cost: ~$0.001-0.002 per digest
 */
async function generateAIInsights(
  digestData: DigestData,
  topContributors: TopContributor[]
): Promise<{ insights: AIInsights; costUsd: number }> {
  const { current, previous } = digestData.key_metrics;

  // Calculate changes
  const messagesChange = previous.messages > 0
    ? Math.round(((current.messages - previous.messages) / previous.messages) * 100)
    : 0;
  const participantsChange = previous.active_participants > 0
    ? Math.round(((current.active_participants - previous.active_participants) / previous.active_participants) * 100)
    : 0;

  const prompt = `Ты - аналитик сообщества. Проанализируй еженедельную активность и дай краткие дружелюбные комментарии (1-2 предложения каждый).

МЕТРИКИ АКТИВНОСТИ:
- Сообщений: ${current.messages} (${messagesChange > 0 ? '+' : ''}${messagesChange}% vs прошлая неделя)
- Активных участников: ${current.active_participants} (${participantsChange > 0 ? '+' : ''}${participantsChange}%)
- Ответов: ${current.replies}
- Реакций: ${current.reactions}

ТОП УЧАСТНИКОВ:
${topContributors.map((c, i) => `${i + 1}. ${c.name}: ${c.messages} сообщений${c.is_new_to_top ? ' (NEW!)' : ''}`).join('\n')}

ЗОНЫ ВНИМАНИЯ:
- Новичков без активности: ${digestData.attention_zones.inactive_newcomers}
- Молчащих 14+ дней: ${digestData.attention_zones.silent_members}

Верни JSON:
{
  "activity_comment": "краткий комментарий по активности",
  "contributors_comment": "краткий комментарий по топ участникам",
  "attention_comment": "краткий комментарий по зонам внимания (если есть проблемы)"
}

Стиль: дружелюбный, мотивирующий, без излишнего пафоса. Не используй много эмодзи.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Ты - дружелюбный аналитик сообщества. Твои комментарии краткие (1-2 предложения), позитивные и конструктивные.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 400,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('Empty AI response');
    }

    const insights = JSON.parse(responseText);

    // Calculate cost (gpt-4o-mini: $0.15/1M input, $0.60/1M output)
    const inputCost = (completion.usage?.prompt_tokens || 0) / 1_000_000 * 0.15;
    const outputCost = (completion.usage?.completion_tokens || 0) / 1_000_000 * 0.60;
    const totalCost = inputCost + outputCost;

    logger.info({ 
      tokens: completion.usage?.total_tokens, 
      costUsd: totalCost 
    }, 'AI Insights generated');

    return {
      insights,
      costUsd: totalCost
    };
  } catch (error) {
    logger.error({ error }, 'AI insights generation failed');
    // Fallback to basic insights
    return {
      insights: {
        activity_comment: current.messages > previous.messages
          ? 'Активность сообщества растёт!'
          : 'Активность сообщества стабильна.',
        contributors_comment: topContributors.length > 0
          ? `Лидирует ${topContributors[0].name} с ${topContributors[0].messages} сообщениями.`
          : '',
        attention_comment: digestData.attention_zones.inactive_newcomers > 0 || digestData.attention_zones.silent_members > 0
          ? 'Есть участники, требующие внимания.'
          : undefined
      },
      costUsd: 0
    };
  }
}

/**
 * Generate suggested actions: rule-based + AI enhancement
 * Cost: ~$0.001 per digest
 */
async function generateSuggestedActions(
  digestData: DigestData,
  topContributors: TopContributor[],
  aiInsights: AIInsights,
  useAI: boolean
): Promise<{ actions: SuggestedAction[]; costUsd: number }> {
  const ruleBasedActions: SuggestedAction[] = [];

  // Rule 1: Inactive newcomers
  if (digestData.attention_zones.inactive_newcomers > 0) {
    ruleBasedActions.push({
      priority: 'high',
      title: 'Написать новичкам',
      description: `${digestData.attention_zones.inactive_newcomers} новых участников не проявили активность. Отправьте welcome-сообщение.`,
      actionType: 'message_newcomers'
    });
  }

  // Rule 2: Events with low registration
  const lowRegEvents = digestData.upcoming_events.filter(e => e.registration_count < 5);
  if (lowRegEvents.length > 0) {
    ruleBasedActions.push({
      priority: 'medium',
      title: `Продвинуть событие "${lowRegEvents[0].title}"`,
      description: `Событие через ${Math.ceil((new Date(lowRegEvents[0].start_time).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} дней, только ${lowRegEvents[0].registration_count} регистраций.`,
      actionType: 'promote_event'
    });
  }

  // Rule 3: Silent members
  if (digestData.attention_zones.silent_members >= 5) {
    ruleBasedActions.push({
      priority: 'medium',
      title: 'Вовлечь молчащих участников',
      description: `${digestData.attention_zones.silent_members} участников не писали 14+ дней. Рассмотрите опрос или интересную тему.`,
      actionType: 'engage_silent'
    });
  }

  // If we have < 3 actions and AI is available, ask AI for more ideas
  let aiActions: SuggestedAction[] = [];
  let costUsd = 0;

  if (useAI && ruleBasedActions.length < 3) {
    try {
      const prompt = `На основе данных сообщества, предложи ${3 - ruleBasedActions.length} дополнительных действия для админа.

Контекст:
- Активность: ${digestData.key_metrics.current.messages} сообщений за неделю
- Топ участники: ${topContributors.map(c => c.name).join(', ')}
- AI insights: ${aiInsights.activity_comment}

Уже предложено:
${ruleBasedActions.map(a => `- ${a.title}`).join('\n')}

Верни JSON массив:
[
  {
    "title": "краткое название",
    "description": "описание (1 предложение)"
  }
]`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Ты предлагаешь практичные действия для админа сообщества.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (responseText) {
        const parsed = JSON.parse(responseText);
        const actions = Array.isArray(parsed) ? parsed : parsed.actions || [];
        
        aiActions = actions.slice(0, 3 - ruleBasedActions.length).map((action: any) => ({
          priority: 'low' as const,
          title: action.title,
          description: action.description,
          actionType: 'other' as const
        }));
      }

      // Calculate cost
      const inputCost = (completion.usage?.prompt_tokens || 0) / 1_000_000 * 0.15;
      const outputCost = (completion.usage?.completion_tokens || 0) / 1_000_000 * 0.60;
      costUsd = inputCost + outputCost;

      logger.info({ 
        tokens: completion.usage?.total_tokens, 
        costUsd 
      }, 'AI Actions generated');
    } catch (error) {
      logger.error({ error }, 'AI actions generation failed');
    }
  }

  return {
    actions: [...ruleBasedActions, ...aiActions].slice(0, 3),
    costUsd
  };
}

/**
 * Log digest generation to openai_api_logs
 */
async function logDigestGeneration(
  orgId: string,
  userId: string | null,
  costUsd: number,
  durationMs: number
): Promise<void> {
  try {
    await supabaseAdmin
      .from('openai_api_logs')
      .insert({
        org_id: orgId,
        created_by: userId,
        request_type: 'weekly_digest',
        model: 'gpt-4o-mini',
        prompt_tokens: 0, // Combined in metadata
        completion_tokens: 0,
        total_tokens: 0,
        cost_usd: costUsd,
        cost_rub: costUsd * 95,
        metadata: {
          duration_ms: durationMs,
          digest_type: 'weekly'
        }
      });

    logger.info({ costUsd, durationMs }, 'Digest generation logged');
  } catch (error) {
    logger.error({ error }, 'Failed to log digest generation');
  }
}

