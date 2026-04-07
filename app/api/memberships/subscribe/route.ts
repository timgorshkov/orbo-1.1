import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getParticipantSession } from '@/lib/participant-auth/session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/memberships/subscribe
 * Create a participant_membership + membership_payment for a plan.
 * Returns { membershipId, paymentId } for redirect to pay page.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/memberships/subscribe' })

  try {
    const body = await request.json()
    const { planId, orgId } = body

    if (!planId || !orgId) {
      return NextResponse.json({ error: 'Missing planId or orgId' }, { status: 400 })
    }

    const db = createAdminServer()

    // Get current user or participant
    const user = await getUnifiedUser()
    const participantSession = await getParticipantSession()
    const participantId = participantSession?.participantId

    if (!user && !participantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load plan
    const { data: plan, error: planErr } = await db
      .from('membership_plans')
      .select('id, name, price, currency, billing_period, custom_period_days, trial_days, org_id, is_active')
      .eq('id', planId)
      .eq('org_id', orgId)
      .single()

    if (planErr || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (!plan.is_active) {
      return NextResponse.json({ error: 'Plan is not active' }, { status: 400 })
    }

    if (!plan.price || plan.price <= 0) {
      return NextResponse.json({ error: 'Plan is free — no payment needed' }, { status: 400 })
    }

    // Find or resolve participant
    let resolvedParticipantId = participantId

    if (!resolvedParticipantId && user?.id) {
      // Try to find participant by user_id
      const { data: participant } = await db
        .from('participants')
        .select('id')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .limit(1)

      if (participant && participant.length > 0) {
        resolvedParticipantId = participant[0].id
      }
    }

    if (!resolvedParticipantId) {
      return NextResponse.json({ error: 'Participant not found. Please join the community first.' }, { status: 400 })
    }

    // Check if already has active membership for this plan
    const { data: existing } = await db
      .from('participant_memberships')
      .select('id, status')
      .eq('participant_id', resolvedParticipantId)
      .eq('plan_id', planId)
      .in('status', ['active', 'trial'])
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Already subscribed to this plan' }, { status: 409 })
    }

    // Create membership in pending_payment status
    const now = new Date()
    const { data: membership, error: memErr } = await db
      .from('participant_memberships')
      .insert({
        participant_id: resolvedParticipantId,
        plan_id: planId,
        org_id: orgId,
        status: 'pending',
        started_at: now.toISOString(),
      })
      .select('id')
      .single()

    if (memErr || !membership) {
      logger.error({ error: memErr?.message }, 'Failed to create membership')
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 })
    }

    // Create payment record
    const { data: payment, error: payErr } = await db
      .from('membership_payments')
      .insert({
        membership_id: membership.id,
        org_id: orgId,
        amount: plan.price,
        currency: plan.currency || 'RUB',
        status: 'pending',
      })
      .select('id')
      .single()

    if (payErr || !payment) {
      logger.error({ error: payErr?.message }, 'Failed to create membership payment')
      // Clean up membership
      await db.from('participant_memberships').delete().eq('id', membership.id)
      return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
    }

    logger.info({
      membership_id: membership.id,
      payment_id: payment.id,
      plan_id: planId,
      org_id: orgId,
      amount: plan.price,
    }, 'Membership subscription initiated')

    return NextResponse.json({
      membershipId: membership.id,
      paymentId: payment.id,
    }, { status: 201 })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error subscribing to membership')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
