import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { initiatePayment } from '@/lib/services/paymentService'
import type { GatewayCode } from '@/lib/services/paymentGateway'

export const dynamic = 'force-dynamic'

// POST /api/pay — initiate a payment session
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/pay' })

  try {
    const body = await request.json()
    const {
      orgId,
      paymentFor,
      amount,
      currency,
      description,
      gatewayCode,
      returnUrl,
      eventId,
      eventRegistrationId,
      membershipPaymentId,
      participantId,
      createdBy,
      metadata,
    } = body

    // Validation
    if (!orgId || !paymentFor || !amount || !gatewayCode || !returnUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, paymentFor, amount, gatewayCode, returnUrl' },
        { status: 400 }
      )
    }

    if (!['event', 'membership'].includes(paymentFor)) {
      return NextResponse.json({ error: 'paymentFor must be "event" or "membership"' }, { status: 400 })
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    if (!['manual', 'yookassa', 'tbank', 'sbp'].includes(gatewayCode)) {
      return NextResponse.json({ error: 'Invalid gatewayCode' }, { status: 400 })
    }

    const result = await initiatePayment({
      orgId,
      paymentFor,
      amount,
      currency,
      description,
      gatewayCode: gatewayCode as GatewayCode,
      returnUrl,
      eventId,
      eventRegistrationId,
      membershipPaymentId,
      participantId,
      createdBy,
      metadata,
    })

    return NextResponse.json({
      session: result.session,
      redirectUrl: result.redirectUrl,
      paymentReference: result.paymentReference,
      qrCodeUrl: result.qrCodeUrl,
    }, { status: 201 })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to initiate payment')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
