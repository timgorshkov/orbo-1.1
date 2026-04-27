/**
 * Cron: charge-recurring
 *
 * Walks recurring_payment_tokens and charges every active token whose
 * next_charge_at has come due. Each successful charge generates a regular
 * Pay-webhook from the acquirer; that webhook reuses the standard
 * paymentService.markSessionSucceeded → addPayment flow to extend the
 * subscription and produce the act/receipt. Here we only:
 *   1. Resolve the gateway adapter.
 *   2. Create a payment_session with payment_for='subscription' and
 *      metadata.recurring_token_id = <token.id> (used by markSessionSucceeded
 *      to advance the schedule on success).
 *   3. Call gateway.chargeWithToken().
 *   4. On synchronous failure (declined card, network), record the failure on
 *      the token; webhooks for those never arrive, so we must handle them
 *      synchronously.
 *
 * Runs daily; idempotent because next_charge_at only advances on success.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createCronLogger } from '@/lib/logger'
import { getGateway, type GatewayCode } from '@/lib/services/paymentGateway'
import {
  listDueTokens,
  onChargeFailed,
  type RecurringToken,
} from '@/lib/services/recurringPaymentService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  return runJob(request)
}

// Allow GET too — some cron schedulers (curl-based) use it
export async function GET(request: NextRequest) {
  return runJob(request)
}

async function runJob(request: NextRequest) {
  const logger = createCronLogger('charge-recurring')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tokens = await listDueTokens(50)
  if (tokens.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  let succeeded = 0
  let failed = 0

  for (const token of tokens) {
    try {
      await chargeOne(token, logger)
      succeeded++
    } catch (err: any) {
      failed++
      logger.error({
        token_id: token.id,
        org_id: token.org_id,
        error: err?.message,
      }, 'Recurring charge attempt threw')
      await onChargeFailed(token.id, err?.message || 'Unknown error').catch(() => {})
    }
  }

  logger.info({ total: tokens.length, succeeded, failed }, 'Recurring charge run finished')
  return NextResponse.json({ success: true, total: tokens.length, succeeded, failed })
}

async function chargeOne(token: RecurringToken, logger: ReturnType<typeof createCronLogger>) {
  const db = createAdminServer()

  // 1. Create a fresh payment_session this charge will settle into.
  const idempotencyKey = `recur_${token.id}_${Date.now()}`
  const description = `Автопродление тарифа${token.plan_code ? ` «${token.plan_code}»` : ''}`

  const { data: inserted, error: insertErr } = await db
    .from('payment_sessions')
    .insert({
      org_id: token.org_id,
      payment_for: 'subscription',
      amount: token.amount,
      currency: token.currency,
      description,
      gateway_code: token.gateway_code,
      status: 'pending',
      idempotency_key: idempotencyKey,
      metadata: {
        plan_code: token.plan_code,
        period_months: token.period_months,
        customer: token.customer_snapshot || null,
        recurring_token_id: token.id,   // ← marker for markSessionSucceeded
      },
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select('*')
    .single()

  if (insertErr || !inserted) {
    throw new Error(`Failed to insert payment_session: ${insertErr?.message}`)
  }
  const session = inserted as any

  // 2. Ask the gateway to charge the saved token.
  const gateway = getGateway(token.gateway_code as GatewayCode)
  const chargeFn = (gateway as any).chargeWithToken
  if (typeof chargeFn !== 'function') {
    throw new Error(`Gateway '${token.gateway_code}' does not support chargeWithToken`)
  }

  const accountId =
    (token.customer_snapshot && (token.customer_snapshot as any).email) ||
    String(token.org_id)
  const email = (token.customer_snapshot && (token.customer_snapshot as any).email) || undefined

  const result = await chargeFn.call(gateway, {
    token: token.gateway_token,
    amount: token.amount,
    currency: token.currency,
    description,
    invoiceId: session.id,
    accountId,
    email,
  })

  // 3. Mark session processing if accepted; on synchronous decline mark token failed
  if (result.success) {
    await db
      .from('payment_sessions')
      .update({
        status: 'processing',
        gateway_payment_id: result.gatewayPaymentId || null,
      })
      .eq('id', session.id)

    logger.info({
      token_id: token.id,
      session_id: session.id,
      gateway_payment_id: result.gatewayPaymentId,
    }, 'Recurring charge sent — awaiting webhook to settle')
  } else {
    await db
      .from('payment_sessions')
      .update({
        status: 'failed',
        error_message: result.error || 'Charge declined',
      })
      .eq('id', session.id)

    await onChargeFailed(token.id, result.error || 'Charge declined')
    logger.warn({
      token_id: token.id,
      session_id: session.id,
      error: result.error,
    }, 'Recurring charge declined')
  }
}
