import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { handlePaymentWebhook } from '@/lib/services/paymentService'
import { verifyCloudPaymentsSignature } from '@/lib/services/gateways/cloudpaymentsGateway'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/cloudpayments — CloudPayments payment webhook.
 *
 * Configure all event URLs in the CloudPayments dashboard to point at this
 * single endpoint. The gateway adapter classifies events by their payload
 * contents.
 *
 * Response codes (CloudPayments contract):
 *   { code: 0  } — accepted (allow the transaction / acknowledge)
 *   { code: 13 } — rejected (CP marks the payment as failed)
 *
 * We split signature verification from event handling so that "informational"
 * events (e.g. Check before charging, Confirm for two-stage flows) — which
 * have no actionable payload for our adapter and would otherwise surface as
 * null/false — are still acknowledged with `{code:0}` instead of inadvertently
 * blocking the payment.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/webhooks/cloudpayments' })

  try {
    const rawBody = await request.text()
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    if (!verifyCloudPaymentsSignature(rawBody, headers)) {
      logger.warn({}, 'CloudPayments webhook: invalid signature, rejecting')
      return NextResponse.json({ code: 13 })
    }

    // Signature is valid — at this point we always ACK with code:0 so we don't
    // accidentally block legitimate transactions. The actionable processing
    // (find session, mark succeeded, fire confirmation, etc.) runs through
    // the regular paymentService pipeline; if it fails to find a session for
    // an intermediate event that's expected — paymentService logs a warning
    // and we continue.
    const result = await handlePaymentWebhook('cloudpayments', rawBody, headers)
    logger.info({
      session_id: result.sessionId,
      processed: result.success,
    }, 'CloudPayments webhook acknowledged')

    return NextResponse.json({ code: 0 })
  } catch (error: any) {
    logger.error({ error: error.message }, 'CloudPayments webhook error')
    // Returning code:0 prevents CloudPayments from retrying our internal bugs
    // forever; we'd rather surface the issue via logs.
    return NextResponse.json({ code: 0 })
  }
}
