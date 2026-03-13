import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { checkFeatureAccess } from '@/lib/services/billingService'
import { recordPayment, confirmPayment, getMembershipPayments } from '@/lib/services/membershipService'

export const dynamic = 'force-dynamic'

async function checkOrgAdmin(orgId: string) {
  const user = await getUnifiedUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null }

  const supabase = createAdminServer()
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'Forbidden', status: 403, user: null }
  }

  const access = await checkFeatureAccess(orgId, 'paid_membership')
  if (!access.allowed) {
    return { error: access.reason || 'Требуется тариф Клубный', status: 403, user: null }
  }

  return { error: null, status: 200, user }
}

export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'membership-payments' })
  try {
    const url = new URL(req.url)
    const membershipId = url.searchParams.get('membershipId')
    const orgId = url.searchParams.get('orgId')
    if (!membershipId || !orgId) return NextResponse.json({ error: 'membershipId and orgId required' }, { status: 400 })

    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payments = await getMembershipPayments(membershipId)
    return NextResponse.json({ payments })
  } catch (err) {
    logger.error({ error: err }, 'Error fetching payments')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'membership-payments' })
  try {
    const body = await req.json()
    const { membershipId, orgId, amount, currency, paymentMethod, status, paidAt, notes } = body
    if (!membershipId || !orgId || !amount) {
      return NextResponse.json({ error: 'membershipId, orgId, amount required' }, { status: 400 })
    }

    const auth = await checkOrgAdmin(orgId)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const payment = await recordPayment({
      membershipId,
      orgId,
      amount,
      currency,
      paymentMethod,
      status: status || 'pending',
      paidAt,
      confirmedBy: status === 'confirmed' ? auth.user!.id : undefined,
      notes,
    })

    if (!payment) return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    return NextResponse.json({ payment }, { status: 201 })
  } catch (err) {
    logger.error({ error: err }, 'Error recording payment')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'membership-payments' })
  try {
    const body = await req.json()
    const { id, orgId, action } = body
    if (!id || !orgId || !action) {
      return NextResponse.json({ error: 'id, orgId, action required' }, { status: 400 })
    }

    const auth = await checkOrgAdmin(orgId)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    if (action === 'confirm') {
      const ok = await confirmPayment(id, auth.user!.id)
      if (!ok) return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    logger.error({ error: err }, 'Error updating payment')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
