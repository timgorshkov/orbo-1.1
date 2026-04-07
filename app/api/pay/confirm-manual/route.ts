import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { confirmManualPayment, reconcileBankTransfer, getPaymentSession } from '@/lib/services/paymentService'

export const dynamic = 'force-dynamic'

// POST /api/pay/confirm-manual — admin confirms a manual/bank transfer payment
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/pay/confirm-manual' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { sessionId, paymentReference, paidAmount } = body

    if (!sessionId && !paymentReference) {
      return NextResponse.json({ error: 'sessionId or paymentReference is required' }, { status: 400 })
    }

    let session

    if (paymentReference) {
      // Reconcile by payment reference
      session = await reconcileBankTransfer(paymentReference, user.id, paidAmount)
      if (!session) {
        return NextResponse.json({ error: 'No pending session found for this payment reference' }, { status: 404 })
      }
    } else {
      // Confirm by session ID
      const existing = await getPaymentSession(sessionId)
      if (!existing) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      // Check access — must be owner/admin of the org
      const role = await getEffectiveOrgRole(user.id, existing.org_id)
      if (!role || (role.role !== 'owner' && role.role !== 'admin')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      session = await confirmManualPayment(sessionId, user.id, paidAmount)
    }

    return NextResponse.json({ session })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to confirm manual payment')

    if (error.message.includes('Cannot confirm') || error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
