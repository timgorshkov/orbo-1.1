/**
 * POST /api/billing/recurring/cancel
 *
 * Cancels the active recurring payment token for an org. Subscription that
 * was set up by it stays active until its current expires_at — we just stop
 * future automatic charges. The owner can re-enable auto-renewal by paying
 * the next period manually with the auto-renewal checkbox.
 *
 * Body: { orgId: string }
 * Auth: org owner
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { getActiveTokenForOrg, cancelToken } from '@/lib/services/recurringPaymentService'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/billing/recurring/cancel' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const orgId = body.orgId
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access || access.role !== 'owner') {
      return NextResponse.json({ error: 'Только владелец может отменить автопродление' }, { status: 403 })
    }

    const token = await getActiveTokenForOrg(orgId, 'subscription')
    if (!token) {
      return NextResponse.json({ success: true, alreadyCancelled: true })
    }

    await cancelToken(token.id, user.id)
    logger.info({
      token_id: token.id,
      org_id: orgId,
      cancelled_by: user.id,
    }, 'Recurring auto-renewal cancelled')

    return NextResponse.json({ success: true, tokenId: token.id })
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Failed to cancel recurring token')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
