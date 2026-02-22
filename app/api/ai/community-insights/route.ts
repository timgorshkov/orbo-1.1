import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { enrichParticipant } from '@/lib/services/participantEnrichmentService'
import { createAPILogger } from '@/lib/logger'

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

    const creditsTotal = org.ai_credits_total ?? 3
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

    // Find top 2 participants by activity_score
    const { data: topParticipants } = await supabase
      .from('participants')
      .select('id, full_name, first_name, last_name, tg_user_id, username, last_activity_at, activity_score')
      .eq('org_id', orgId)
      .neq('source', 'bot')
      .gt('activity_score', 0)
      .order('activity_score', { ascending: false })
      .limit(2)

    if (!topParticipants || topParticipants.length === 0) {
      return NextResponse.json({
        error: 'no_data',
        message: 'Нет активных участников для анализа.',
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
          activityScore: p.activity_score || 0,
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
          activityScore: p.activity_score || 0,
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

    const total = org?.ai_credits_total ?? 3
    const used = org?.ai_credits_used ?? 0

    // Check if there are active participants
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('source', 'bot')
      .gt('activity_score', 0)

    const hasData = (count || 0) > 0

    return NextResponse.json({
      credits: { total, used, remaining: total - used },
      hasData,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
