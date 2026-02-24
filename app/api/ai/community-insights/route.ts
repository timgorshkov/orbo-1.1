import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { enrichParticipant } from '@/lib/services/participantEnrichmentService'
import { createAPILogger } from '@/lib/logger'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'

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

    const creditsTotal = org.ai_credits_total ?? 5
    const creditsUsed = org.ai_credits_used ?? 0
    const remaining = creditsTotal - creditsUsed

    if (remaining <= 0) {
      return NextResponse.json({
        error: 'no_credits',
        message: 'AI-кредиты закончились.',
        credits: { total: creditsTotal, used: creditsUsed, remaining: 0 },
      }, { status: 402 })
    }

    // Get org groups
    const { data: orgGroups } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)

    const chatIds = orgGroups?.map(g => g.tg_chat_id) || []

    if (chatIds.length === 0) {
      return NextResponse.json({
        error: 'no_data',
        message: 'Нет подключённых групп.',
      }, { status: 400 })
    }

    // Find top 2 participants by actual message count (JOIN with activity_events)
    const chatIdsList = chatIds.map(id => `'${id}'`).join(',')
    const { data: topByMessages } = await (supabase as any).raw(`
      SELECT p.id, p.full_name, p.first_name, p.last_name, p.tg_user_id, p.username, p.last_activity_at,
             COUNT(ae.id) as msg_count
      FROM participants p
      INNER JOIN activity_events ae
        ON ae.tg_user_id = p.tg_user_id
        AND ae.event_type = 'message'
        AND ae.tg_chat_id IN (${chatIdsList})
      WHERE p.org_id = $1
        AND p.source != 'bot'
        AND p.tg_user_id IS NOT NULL
      GROUP BY p.id
      HAVING COUNT(ae.id) >= 5
      ORDER BY msg_count DESC
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

    // Decrement 1 credit for the batch
    await supabase
      .from('organizations')
      .update({ ai_credits_used: creditsUsed + 1 })
      .eq('id', orgId)

    const newRemaining = remaining - 1

    logger.info({
      org_id: orgId,
      profiles_analyzed: profiles.filter(p => p.success).length,
      duration_ms: duration,
      credits_remaining: newRemaining,
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
      credits: { total: creditsTotal, used: creditsUsed + 1, remaining: newRemaining },
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

    // Credits
    const { data: org } = await supabase
      .from('organizations')
      .select('ai_credits_total, ai_credits_used')
      .eq('id', orgId)
      .single()

    const total = org?.ai_credits_total ?? 5
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
      credits: { total, used, remaining: total - used },
      hasData,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
