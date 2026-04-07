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
    const { sessionId, amount, reason } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const session = await getPaymentSession(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check access — org owner or superadmin
    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      const role = await getEffectiveOrgRole(user.id, session.org_id)
      if (!role || role.role !== 'owner') {
        return NextResponse.json({ error: 'Only org owner or superadmin can process refunds' }, { status: 403 })
      }
    }

    const result = await processRefund(sessionId, user.id, amount, reason)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to process refund')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
