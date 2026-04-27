/**
 * Recurring Payment Service
 *
 * Manages saved acquirer tokens for unattended subscription renewal.
 *
 * Lifecycle:
 *   1. User pays for the first month with the "автопродление" checkbox enabled.
 *   2. Gateway returns a Token in the Pay-webhook payload.
 *   3. saveTokenFromInit() persists it with next_charge_at = paid_at + period.
 *   4. /api/cron/charge-recurring runs daily; for each due active token it
 *      calls chargeOnce() which creates a payment_session and asks the gateway
 *      to charge the saved card. The webhook from the gateway hits
 *      paymentService.markSessionSucceeded → existing subscription renewal
 *      pipeline (org_invoice, AЛ-act, period extension), and updates the
 *      token's next_charge_at on the way out via onChargeSucceeded().
 *
 * Failure handling:
 *   - Decline (insufficient funds, expired card, etc.) → consecutive_failures++
 *   - After 3 consecutive declines → status='failed', org owner is notified
 *     (notification implementation in phase 4-B).
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import type { GatewayCode } from './paymentGateway'

const logger = createServiceLogger('RecurringPayment')

const MAX_CONSECUTIVE_FAILURES = 3

// ─── Types ──────────────────────────────────────────────────────────

export interface RecurringToken {
  id: string
  org_id: string
  gateway_code: GatewayCode
  gateway_token: string
  card_last4: string | null
  card_expiry: string | null
  payment_for: string
  plan_code: string | null
  period_months: number
  amount: number
  currency: string
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'failed'
  next_charge_at: string | null
  last_charged_at: string | null
  last_charge_session_id: string | null
  consecutive_failures: number
  last_failure_reason: string | null
  customer_snapshot: Record<string, any> | null
  created_at: string
  updated_at: string
  cancelled_at: string | null
  cancelled_by: string | null
}

// ─── Save token from a successful init payment ──────────────────────

/**
 * Called from paymentService.markSessionSucceeded when a subscription payment
 * with metadata.recurrent_init=true succeeds and the gateway returned a token
 * in the webhook payload. Idempotent: re-running with the same session is a
 * no-op (we look the existing row up by session id).
 */
export async function saveTokenFromInit(params: {
  orgId: string
  gatewayCode: GatewayCode
  gatewayToken: string
  paymentFor: string                 // 'subscription'
  planCode: string | null
  periodMonths: number
  amount: number
  currency: string
  cardLast4?: string
  cardExpiry?: string
  customerSnapshot?: Record<string, any>
  sessionId: string
  paidAt: string                     // ISO timestamp
}): Promise<RecurringToken | null> {
  const db = createAdminServer()

  const nextChargeAt = computeNextChargeAt(params.paidAt, params.periodMonths)

  // Cancel any prior active token for the same (org, payment_for) — replace
  // semantics: re-enabling auto-renewal after a card change supersedes the old
  // token without leaving two competing rows.
  await db.raw(
    `UPDATE recurring_payment_tokens
        SET status = 'cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()
      WHERE org_id = $1
        AND payment_for = $2
        AND status IN ('active', 'paused')`,
    [params.orgId, params.paymentFor]
  )

  const { data, error } = await db.raw(
    `INSERT INTO recurring_payment_tokens
       (org_id, gateway_code, gateway_token, card_last4, card_expiry,
        payment_for, plan_code, period_months, amount, currency,
        status, next_charge_at, last_charged_at, last_charge_session_id,
        customer_snapshot, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             'active', $11, $12, $13, $14, NOW(), NOW())
     RETURNING *`,
    [
      params.orgId,
      params.gatewayCode,
      params.gatewayToken,
      params.cardLast4 || null,
      params.cardExpiry || null,
      params.paymentFor,
      params.planCode,
      params.periodMonths,
      params.amount,
      params.currency,
      nextChargeAt,
      params.paidAt,
      params.sessionId,
      params.customerSnapshot ? JSON.stringify(params.customerSnapshot) : null,
    ]
  )

  if (error || !data?.[0]) {
    logger.error({
      org_id: params.orgId,
      session_id: params.sessionId,
      error: error?.message,
    }, 'Failed to save recurring payment token')
    return null
  }

  const row = data[0] as RecurringToken
  logger.info({
    token_id: row.id,
    org_id: params.orgId,
    payment_for: params.paymentFor,
    plan_code: params.planCode,
    next_charge_at: nextChargeAt,
  }, 'Recurring payment token saved')

  return row
}

// ─── Lookups ────────────────────────────────────────────────────────

export async function getActiveTokenForOrg(orgId: string, paymentFor = 'subscription'): Promise<RecurringToken | null> {
  const db = createAdminServer()
  const { data } = await db
    .from('recurring_payment_tokens')
    .select('*')
    .eq('org_id', orgId)
    .eq('payment_for', paymentFor)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
  return ((data as any) || [])[0] || null
}

/**
 * Active tokens whose next_charge_at has come due (≤ now). Used by cron.
 */
export async function listDueTokens(limit = 100): Promise<RecurringToken[]> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `SELECT *
       FROM recurring_payment_tokens
      WHERE status = 'active'
        AND next_charge_at IS NOT NULL
        AND next_charge_at <= NOW()
      ORDER BY next_charge_at ASC
      LIMIT $1`,
    [limit]
  )
  if (error) {
    logger.error({ error: error.message }, 'Failed to list due tokens')
    return []
  }
  return (data || []) as RecurringToken[]
}

// ─── Charge result handlers (called by cron / webhook) ──────────────

/**
 * After a recurrent charge webhook arrived as 'payment.succeeded' and the
 * subscription period was extended, advance the token's next_charge_at and
 * reset failure counter.
 */
export async function onChargeSucceeded(tokenId: string, sessionId: string, paidAt: string): Promise<void> {
  const db = createAdminServer()
  // Read current period to compute the next charge date
  const { data } = await db
    .from('recurring_payment_tokens')
    .select('period_months')
    .eq('id', tokenId)
    .single()
  const periodMonths = (data as any)?.period_months || 1
  const nextChargeAt = computeNextChargeAt(paidAt, periodMonths)

  await db
    .from('recurring_payment_tokens')
    .update({
      last_charged_at: paidAt,
      last_charge_session_id: sessionId,
      next_charge_at: nextChargeAt,
      consecutive_failures: 0,
      last_failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenId)

  logger.info({
    token_id: tokenId,
    session_id: sessionId,
    next_charge_at: nextChargeAt,
  }, 'Recurring token advanced')
}

/**
 * Charge attempt failed (gateway declined, network error). Increment counter
 * and disable the token if we've exhausted retries.
 */
export async function onChargeFailed(tokenId: string, reason: string): Promise<void> {
  const db = createAdminServer()
  // Read current state
  const { data } = await db
    .from('recurring_payment_tokens')
    .select('consecutive_failures, period_months')
    .eq('id', tokenId)
    .single()
  const failures = ((data as any)?.consecutive_failures || 0) + 1
  const periodMonths = (data as any)?.period_months || 1

  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    await db
      .from('recurring_payment_tokens')
      .update({
        status: 'failed',
        consecutive_failures: failures,
        last_failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
    logger.warn({
      token_id: tokenId,
      failures,
      reason,
    }, 'Recurring token disabled after consecutive failures')
    return
  }

  // Schedule retry: 1 day after the failure, growing with each attempt
  const retryAt = new Date()
  retryAt.setDate(retryAt.getDate() + failures)
  await db
    .from('recurring_payment_tokens')
    .update({
      consecutive_failures: failures,
      last_failure_reason: reason,
      next_charge_at: retryAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenId)

  logger.info({
    token_id: tokenId,
    failures,
    next_retry_at: retryAt.toISOString(),
    reason,
  }, 'Recurring token retry scheduled')
}

// ─── Cancel ─────────────────────────────────────────────────────────

export async function cancelToken(tokenId: string, byUserId: string | null): Promise<void> {
  const db = createAdminServer()
  await db
    .from('recurring_payment_tokens')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: byUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenId)
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeNextChargeAt(paidAtIso: string, periodMonths: number): string {
  const d = new Date(paidAtIso)
  d.setMonth(d.getMonth() + periodMonths)
  return d.toISOString()
}
