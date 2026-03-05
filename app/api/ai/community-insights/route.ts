import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { enrichParticipant } from '@/lib/services/participantEnrichmentService'
import { createAPILogger } from '@/lib/logger'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'
import { getOrgBillingStatus } from '@/lib/services/billingService'

/**
 * POST: Run AI enrichment on top 2 most active participants
 * 1 credit = 2 participant profiles analyzed
 */
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

    const creditsTotal = org.ai_credits_total ?? 20
    const creditsUsed = org.ai_credits_used ?? 0

    const billingStatus = await getOrgBillingStatus(orgId)
    const isUnlimited = billingStatus.plan.limits.ai_requests_per_month === -1

    if (!isUnlimited) {
      const remaining = creditsTotal - creditsUsed
      if (remaining <= 0) {
        return NextResponse.json({
          error: 'no_credits',
          message: 'AI-кредиты закончились.',
          credits: { total: creditsTotal, used: creditsUsed, remaining: 0 },
        }, { status: 402 })
      }
    }

    // Get Telegram and MAX chat IDs for this org
    const [{ data: orgGroups }, { data: orgMaxGroups }] = await Promise.all([
      supabase.from('org_telegram_groups').select('tg_chat_id').eq('org_id', orgId),
      supabase.from('org_max_groups').select('max_chat_id').eq('org_id', orgId),
    ])

    const chatIds = orgGroups?.map(g => g.tg_chat_id) || []
    const maxChatIds = (orgMaxGroups || []).map((g: { max_chat_id: number }) => g.max_chat_id)

    const hasAnyGroups = chatIds.length > 0 || maxChatIds.length > 0
    if (!hasAnyGroups) {
      return NextResponse.json({
        error: 'no_data',
        message: 'Нет подключённых групп.',
      }, { status: 400 })
    }

    // Build activity count subquery combining Telegram + MAX messages
    const tgPart = chatIds.length > 0
      ? `SELECT tg_user_id AS uid, NULL::bigint AS max_uid, COUNT(*) AS cnt
         FROM activity_events
         WHERE event_type = 'message'
           AND tg_chat_id = ANY(ARRAY[${chatIds.map(Number).join(',')}]::bigint[])
         GROUP BY tg_user_id`
      : null

    const maxPart = maxChatIds.length > 0
      ? `SELECT NULL::bigint AS uid, max_user_id AS max_uid, COUNT(*) AS cnt
         FROM activity_events
         WHERE event_type = 'message'
           AND messenger_type = 'max'
           AND max_chat_id = ANY(ARRAY[${maxChatIds.map(Number).join(',')}]::bigint[])
         GROUP BY max_user_id`
      : null

    const activityUnion = [tgPart, maxPart].filter(Boolean).join(' UNION ALL ')

    // Find top 2 UN-ANALYZED participants first, then fall back to already-analyzed
    // "analyzed" = custom_attributes->>'last_enriched_at' IS NOT NULL
    const { data: topByMessages } = await (supabase as any).raw(`
      WITH activity AS (
        SELECT COALESCE(uid, 0) AS tg_uid, COALESCE(max_uid, 0) AS max_uid, SUM(cnt) AS msg_count
        FROM (${activityUnion}) sub
        GROUP BY COALESCE(uid, 0), COALESCE(max_uid, 0)
      ),
      candidates AS (
        SELECT p.id, p.full_name, p.first_name, p.last_name, p.tg_user_id, p.max_user_id,
               p.username, p.last_activity_at,
               COALESCE(a.msg_count, 0) AS msg_count,
               CASE WHEN p.custom_attributes->>'last_enriched_at' IS NOT NULL THEN 1 ELSE 0 END AS is_analyzed
        FROM participants p
        LEFT JOIN activity a
          ON (p.tg_user_id IS NOT NULL AND a.tg_uid = p.tg_user_id)
          OR (p.max_user_id IS NOT NULL AND a.max_uid = p.max_user_id)
        WHERE p.org_id = $1
          AND p.source != 'bot'
          AND (p.tg_user_id IS NOT NULL OR p.max_user_id IS NOT NULL)
          AND COALESCE(a.msg_count, 0) >= 5
      )
      -- Prefer un-analyzed; fall back to analyzed when not enough un-analyzed rows
      (SELECT * FROM candidates WHERE is_analyzed = 0 ORDER BY msg_count DESC LIMIT 2)
      UNION ALL
      (SELECT * FROM candidates WHERE is_analyzed = 1 ORDER BY msg_count DESC LIMIT 2)
      LIMIT 2
    `, [orgId])

    const topParticipants = topByMessages || []

    if (topParticipants.length === 0) {
      return NextResponse.json({
        error: 'no_data',
        message: 'Нет участников с достаточным числом сообщений для анализа.',
      }, { status: 400 })
    }

    // Run AI enrichment for each participant (sequentially to avoid rate limits)
    const startTime = Date.now()
    const profiles: any[] = []

    for (const p of topParticipants) {
      const displayName = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Участник'
      try {
        const result = await enrichParticipant(p.id, orgId, {
          useAI: true,
          includeBehavior: true,
          includeReactions: true,
          daysBack: 90,
        }, user.id)

        profiles.push({
          id: p.id,
          name: displayName,
          username: p.username,
          messageCount: Number(p.msg_count) || 0,
          lastActive: p.last_activity_at,
          interests: result.ai_analysis?.interests_keywords || [],
          topics: result.ai_analysis?.topics_discussed || {},
          recentAsks: result.ai_analysis?.recent_asks || [],
          city: result.ai_analysis?.city_inferred || null,
          role: result.behavioral_role?.role || null,
          success: result.success,
        })
      } catch (err) {
        logger.error({
          participant_id: p.id,
          error: err instanceof Error ? err.message : String(err),
        }, 'Failed to enrich participant')
        profiles.push({
          id: p.id,
          name: displayName,
          username: p.username,
          messageCount: Number(p.msg_count) || 0,
          interests: [],
          topics: {},
          recentAsks: [],
          city: null,
          role: null,
          success: false,
        })
      }
    }

    const duration = Date.now() - startTime

    let newRemaining: number
    if (isUnlimited) {
      newRemaining = -1
    } else {
      await supabase
        .from('organizations')
        .update({ ai_credits_used: creditsUsed + 1 })
        .eq('id', orgId)
      newRemaining = creditsTotal - creditsUsed - 1
    }

    logger.info({
      org_id: orgId,
      profiles_analyzed: profiles.filter(p => p.success).length,
      duration_ms: duration,
      credits_remaining: newRemaining,
      unlimited: isUnlimited,
    }, 'AI participant profiles analyzed')

    logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.AI_COMMUNITY_INSIGHTS,
      resourceType: ResourceTypes.AI_INSIGHTS,
      resourceId: orgId,
      metadata: {
        profiles_analyzed: profiles.filter(p => p.success).length,
        participant_ids: profiles.map(p => p.id),
        credits_remaining: newRemaining,
        duration_ms: duration,
      },
    }).catch(() => {});

    return NextResponse.json({
      profiles,
      credits: { total: isUnlimited ? -1 : creditsTotal, used: isUnlimited ? 0 : creditsUsed + 1, remaining: newRemaining },
      meta: { duration_ms: duration, count: profiles.length },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error({ error: msg }, 'AI participant analysis failed')
    return NextResponse.json({ error: 'AI analysis failed', details: msg }, { status: 500 })
  }
}

/**
 * GET: Check credits + whether there's enough data to show the widget
 */
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

    // Credits & billing plan
    const { data: org } = await supabase
      .from('organizations')
      .select('ai_credits_total, ai_credits_used')
      .eq('id', orgId)
      .single()

    const billingStatus = await getOrgBillingStatus(orgId)
    const isUnlimited = billingStatus.plan.limits.ai_requests_per_month === -1

    const total = org?.ai_credits_total ?? 20
    const used = org?.ai_credits_used ?? 0

    // Check if there are groups with active participants
    const { data: orgGroups } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)

    let hasData = false
    if (orgGroups && orgGroups.length > 0) {
      const gIds = orgGroups.map(g => `'${g.tg_chat_id}'`).join(',')
      const { data: check } = await (supabase as any).raw(`
        SELECT 1 FROM activity_events ae
        INNER JOIN participants p ON p.tg_user_id = ae.tg_user_id AND p.org_id = $1
        WHERE ae.event_type = 'message' AND ae.tg_chat_id IN (${gIds})
        AND p.source != 'bot'
        LIMIT 1
      `, [orgId])
      hasData = check && check.length > 0
    }

    return NextResponse.json({
      credits: isUnlimited
        ? { total: -1, used: 0, remaining: -1 }
        : { total, used, remaining: total - used },
      hasData,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
