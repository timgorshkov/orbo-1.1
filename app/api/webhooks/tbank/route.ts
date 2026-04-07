import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { handlePaymentWebhook } from '@/lib/services/paymentService'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/tbank — T-Bank payment webhook
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/webhooks/tbank' })

  try {
    const rawBody = await request.text()
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    const result = await handlePaymentWebhook('tbank', rawBody, headers)

    if (result.success) {
      logger.info({ session_id: result.sessionId }, 'T-Bank webhook processed')
      // T-Bank expects "OK" response
      return new NextResponse('OK', { status: 200 })
    }

    logger.warn({}, 'T-Bank webhook: failed to process')
    return new NextResponse('FAIL', { status: 400 })
  } catch (error: any) {
    logger.error({ error: error.message }, 'T-Bank webhook error')
    // Return OK to prevent retries
    return new NextResponse('OK', { status: 200 })
  }
}
