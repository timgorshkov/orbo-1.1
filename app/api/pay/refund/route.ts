import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { createAPILogger } from '@/lib/logger'
import { processRefund, getPaymentSession } from '@/lib/services/paymentService'

export const dynamic = 'force-dynamic'

// POST /api/pay/refund — refund a succeeded payment
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/pay/refund' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { sessionId, reason } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const session = await getPaymentSession(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check access — org owner, admin, or superadmin
    const isSA = await isSuperadmin()
    if (!isSA) {
      const role = await getEffectiveOrgRole(user.id, session.org_id)
      if (!role || !['owner', 'admin'].includes(role.role)) {
        return NextResponse.json({ error: 'Только владелец или администратор организации может оформить возврат' }, { status: 403 })
      }
    }

    const result = await processRefund(sessionId, user.id, reason)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, refundAmount: result.refundAmount })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to process refund')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
