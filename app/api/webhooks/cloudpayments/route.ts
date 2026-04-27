import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { handlePaymentWebhook } from '@/lib/services/paymentService'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/cloudpayments — CloudPayments payment webhook.
 *
 * Configure all event URLs (Pay/Fail/Cancel/Refund) in the CloudPayments
 * dashboard to point at this single endpoint. The gateway adapter classifies
 * events by their payload contents.
 *
 * CloudPayments expects a JSON response of the form { code: 0 } when the
 * webhook is accepted (the transaction is allowed to settle). Returning
 * { code: 13 } tells CP to mark the payment as rejected — we use that for
 * signature failures or unmatched sessions, so accidentally-misdirected
 * traffic isn't silently treated as a successful payment.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/webhooks/cloudpayments' })

  try {
    const rawBody = await request.text()
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    const result = await handlePaymentWebhook('cloudpayments', rawBody, headers)

    if (result.success) {
      logger.info({ session_id: result.sessionId }, 'CloudPayments webhook processed')
      return NextResponse.json({ code: 0 })
    }

    logger.warn({}, 'CloudPayments webhook: rejected (invalid signature or unknown session)')
    return NextResponse.json({ code: 13 })
  } catch (error: any) {
    logger.error({ error: error.message }, 'CloudPayments webhook error')
    // Return code 0 to prevent retries for our own bugs — CP retries indefinitely
    // if it receives non-zero codes, which would amplify any internal incident.
    return NextResponse.json({ code: 0 })
  }
}
