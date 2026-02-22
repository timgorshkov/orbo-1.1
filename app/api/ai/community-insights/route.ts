import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { openai } from '@/lib/services/openaiClient'
import { createAPILogger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/ai/community-insights' })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = await request.json()
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    }

    const supabase = createAdminServer()

    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access || (access.role !== 'owner' && access.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, ai_credits_total, ai_credits_used')
      .eq('id', orgId)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Org not found' }, { status: 404 })
    }

    const creditsTotal = org.ai_credits_total ?? 3
    const creditsUsed = org.ai_credits_used ?? 0
    const remaining = creditsTotal - creditsUsed

    if (remaining <= 0) {
      return NextResponse.json({
        error: 'no_credits',
        message: 'AI-кредиты закончились. Свяжитесь с нами для подключения.',
        credits: { total: creditsTotal, used: creditsUsed, remaining: 0 },
      }, { status: 402 })
    }

    // Get org groups first (needed for subsequent queries)
    const { data: orgGroups } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)

    const chatIds = orgGroups?.map(g => String(g.tg_chat_id)) || []

    // Gather data in parallel
    const [
      participantsResult,
      eventsResult,
      groupsResult,
      recentMessagesResult,
    ] = await Promise.all([
      supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('source', 'bot'),
      supabase
        .from('events')
        .select('id, title, start_time, registration_count, attendance_count, status')
        .eq('org_id', orgId)
        .order('start_time', { ascending: false })
        .limit(10),
      chatIds.length > 0
        ? supabase
            .from('telegram_groups')
            .select('title, member_count, bot_status, tg_chat_id')
            .in('tg_chat_id', chatIds)
        : Promise.resolve({ data: [] }),
      chatIds.length > 0
        ? supabase
            .from('group_messages')
            .select('sender_name, text, created_at')
            .in('tg_chat_id', chatIds)
            .order('created_at', { ascending: false })
            .limit(80)
        : Promise.resolve({ data: [] }),
    ])

    const participantsCount = participantsResult.count || 0
    const events = eventsResult.data || []
    const groups = groupsResult.data || []
    const recentMessages = recentMessagesResult.data || []

    // Attention zones: churning + inactive newcomers (simple queries)
    let silentCount = 0
    let inactiveNewcomersCount = 0

    if (participantsCount > 0) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

      const [silentResult, newcomersResult] = await Promise.all([
        supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .neq('source', 'bot')
          .lt('last_active_at', fourteenDaysAgo),
        supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .neq('source', 'bot')
          .gte('first_seen_at', threeDaysAgo)
          .is('last_active_at', null),
      ])

      silentCount = silentResult.count || 0
      inactiveNewcomersCount = newcomersResult.count || 0
    }

    // Build summaries for prompt
    const eventsSummary = events.map((e: any) => {
      const date = new Date(e.start_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      const attendance = e.attendance_count ? `, пришло ${e.attendance_count}` : ''
      return `- ${e.title} (${date}): ${e.registration_count || 0} рег.${attendance}, ${e.status}`
    }).join('\n')

    const groupsSummary = groups.map((g: any) =>
      `- ${g.title || 'Группа'}: ${g.member_count || '?'} участников, бот ${g.bot_status === 'connected' ? 'подключён' : 'не подключён'}`
    ).join('\n')

    const topSenders: Record<string, number> = {}
    for (const m of recentMessages) {
      const name = (m as any).sender_name || 'Неизвестный'
      topSenders[name] = (topSenders[name] || 0) + 1
    }
    const topSendersList = Object.entries(topSenders)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => `- ${name}: ${count} сообщ.`)
      .join('\n')

    const prompt = `Ты — AI-аналитик Telegram-сообщества "${org.name}".

Данные:
- Участников: ${participantsCount}
- Групп: ${groups.length}
${groupsSummary || '(нет подключённых групп)'}

${eventsSummary ? `События (последние):\n${eventsSummary}` : 'Событий пока нет.'}

${topSendersList ? `Активные участники (из последних 80 сообщений):\n${topSendersList}` : 'Сообщений пока нет.'}

Зоны внимания:
- Молчат 14+ дней: ${silentCount}
- Новички без активности (3 дня): ${inactiveNewcomersCount}

Дай AI-анализ. Ответ строго JSON:
{
  "health_score": число 1-10,
  "health_label": "2-3 слова оценки",
  "key_findings": ["Факт 1", "Факт 2", "Факт 3"],
  "risks": ["Риск (если есть)"],
  "recommendations": ["Действие 1", "Действие 2", "Действие 3"],
  "highlight": "Одна яркая фраза с цифрой для мотивации"
}

Правила:
- key_findings: 3-5 наблюдений из данных. Конкретные цифры, не общие фразы.
- risks: 1-2 проблемы. Если данных мало — честно скажи.
- recommendations: 2-3 конкретных действия на ближайшую неделю.
- highlight: короткая фраза для виджета, с цифрой.
- Мало данных — давай рекомендации по первым шагам, не выдумывай метрики.
- Русский, кратко.`

    const startTime = Date.now()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'AI-аналитик Telegram-сообществ. Отвечай строго JSON, на русском.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0].message.content || '{}'
    const insights = JSON.parse(raw)
    const duration = Date.now() - startTime

    const inputTokens = response.usage?.prompt_tokens || 0
    const outputTokens = response.usage?.completion_tokens || 0
    const totalTokens = response.usage?.total_tokens || 0
    const costUsd = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000)

    // Log + decrement credits in parallel
    await Promise.all([
      supabase.from('openai_api_logs').insert({
        org_id: orgId,
        created_by: user.id,
        request_type: 'community_insights',
        model: 'gpt-4o-mini',
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: totalTokens,
        cost_usd: costUsd,
        cost_rub: costUsd * 95,
        metadata: { duration_ms: duration, participants: participantsCount, events_count: events.length },
      }),
      supabase
        .from('organizations')
        .update({ ai_credits_used: creditsUsed + 1 })
        .eq('id', orgId),
    ])

    const newRemaining = remaining - 1

    logger.info({
      org_id: orgId,
      tokens: totalTokens,
      cost_usd: costUsd,
      duration_ms: duration,
      credits_remaining: newRemaining,
    }, 'Community AI insights generated')

    return NextResponse.json({
      insights,
      credits: { total: creditsTotal, used: creditsUsed + 1, remaining: newRemaining },
      meta: { tokens: totalTokens, duration_ms: duration },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error({ error: msg }, 'Community insights failed')
    return NextResponse.json({ error: 'AI analysis failed', details: msg }, { status: 500 })
  }
}

// GET: check credits without running analysis
export async function GET(request: NextRequest) {
  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    }

    const supabase = createAdminServer()

    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('ai_credits_total, ai_credits_used')
      .eq('id', orgId)
      .single()

    const total = org?.ai_credits_total ?? 3
    const used = org?.ai_credits_used ?? 0

    return NextResponse.json({ credits: { total, used, remaining: total - used } })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
