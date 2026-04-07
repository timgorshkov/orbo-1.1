import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { pollSessionStatus, getPaymentSession } from '@/lib/services/paymentService'

export const dynamic = 'force-dynamic'

// GET /api/pay/status/[sessionId] — poll payment status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/pay/status' })
  const { sessionId } = await params

  try {
    // If poll=true, check with gateway for latest status
    const poll = request.nextUrl.searchParams.get('poll') !== 'false'

    const session = poll
      ? await pollSessionStatus(sessionId)
      : await getPaymentSession(sessionId)

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: session.id,
      status: session.status,
      amount: session.amount,
      currency: session.currency,
      payment_for: session.payment_for,
      gateway_code: session.gateway_code,
      payment_url: session.payment_url,
      payment_reference: session.payment_reference,
      paid_at: session.paid_at,
      error_message: session.error_message,
    })
  } catch (error: any) {
    logger.error({ error: error.message, session_id: sessionId }, 'Failed to get payment status')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
