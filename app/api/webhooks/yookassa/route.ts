import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { handlePaymentWebhook } from '@/lib/services/paymentService'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/yookassa — YooKassa payment webhook
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/webhooks/yookassa' })

  try {
    const rawBody = await request.text()
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    const result = await handlePaymentWebhook('yookassa', rawBody, headers)

    if (result.success) {
      logger.info({ session_id: result.sessionId }, 'YooKassa webhook processed')
      return NextResponse.json({ success: true })
    }

    logger.warn({}, 'YooKassa webhook: failed to process')
    return NextResponse.json({ success: false }, { status: 400 })
  } catch (error: any) {
    logger.error({ error: error.message }, 'YooKassa webhook error')
    // Always return 200 to prevent retries for broken webhooks
    return NextResponse.json({ success: false })
  }
}
