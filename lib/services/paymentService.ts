/**
 * Payment Service — central orchestrator for all payment flows.
 *
 * Manages payment_sessions lifecycle:
 *   initiatePayment → gateway.createPayment → save session → redirect user
 *   handlePaymentWebhook → verify → update session → record in ledger
 *   confirmManualPayment → mark succeeded → record in ledger
 *   processRefund → gateway.refund → update session → record refund in ledger
 *   reconcileBankTransfer → match by payment_reference → confirm
 *
 * Payment reference format: ORB-{org4}-{sess4} (for bank transfer reconciliation)
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { getGateway, type GatewayCode, type WebhookEvent } from './paymentGateway'
import { recordEventPayment, recordMembershipPayment } from './orgAccountService'

const logger = createServiceLogger('PaymentService')

// ─── Types ──────────────────────────────────────────────────────────

export type PaymentFor = 'event' | 'membership'
export type SessionStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'

export interface PaymentSession {
  id: string
  org_id: string
  payment_for: PaymentFor
  event_id: string | null
  event_registration_id: string | null
  membership_payment_id: string | null
  participant_id: string | null
  amount: number
  currency: string
  description: string | null
  gateway_code: GatewayCode
  gateway_payment_id: string | null
  gateway_data: Record<string, any>
  payment_reference: string | null
  status: SessionStatus
  return_url: string | null
  payment_url: string | null
  idempotency_key: string | null
  metadata: Record<string, any>
  error_message: string | null
  created_by: string | null
  expires_at: string | null
  paid_at: string | null
  refunded_at: string | null
  created_at: string
  updated_at: string
}

export interface InitiatePaymentParams {
  orgId: string
  paymentFor: PaymentFor
  amount: number
  currency?: string
  description?: string
  gatewayCode: GatewayCode
  returnUrl: string
  /** For event payments */
  eventId?: string
  eventRegistrationId?: string
  /** For membership payments */
  membershipPaymentId?: string
  /** Participant making the payment */
  participantId?: string
  /** User initiating (if logged in) */
  createdBy?: string
  metadata?: Record<string, any>
}

export interface InitiatePaymentResult {
  session: PaymentSession
  /** URL to redirect user to (gateway checkout page) */
  redirectUrl?: string
  /** For bank transfers: payment reference */
  paymentReference?: string
  /** For SBP: QR code URL */
  qrCodeUrl?: string
}

// ─── Payment Reference ──────────────────────────────────────────────

/**
 * Generate a unique payment reference for bank transfer reconciliation.
 * Format: ORB-{org4}-{sess4} — e.g., ORB-A1B2-C3D4
 */
function generatePaymentReference(orgId: string, sessionId: string): string {
  const orgPart = orgId.replace(/-/g, '').slice(0, 4).toUpperCase()
  const sessPart = sessionId.replace(/-/g, '').slice(0, 4).toUpperCase()
  return `ORB-${orgPart}-${sessPart}`
}

// ─── Initiate Payment ───────────────────────────────────────────────

/**
 * Create a payment session and initiate payment with the chosen gateway.
 */
export async function initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
  const db = createAdminServer()

  // Build idempotency key
  const idempotencyKey = params.eventRegistrationId
    ? `pay_evt_${params.eventRegistrationId}_${params.gatewayCode}`
    : params.membershipPaymentId
    ? `pay_mbr_${params.membershipPaymentId}_${params.gatewayCode}`
    : `pay_${params.orgId}_${Date.now()}`

  // Check for existing active session with same idempotency key
  const { data: existing } = await db
    .from('payment_sessions')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .in('status', ['pending', 'processing'])
    .limit(1)

  if (existing && existing.length > 0) {
    const session = existing[0] as PaymentSession
    return {
      session,
      redirectUrl: session.payment_url || undefined,
      paymentReference: session.payment_reference || undefined,
    }
  }

  // Create session record first to get ID for payment reference
  const { data: session, error: insertErr } = await db
    .from('payment_sessions')
    .insert({
      org_id: params.orgId,
      payment_for: params.paymentFor,
      event_id: params.eventId || null,
      event_registration_id: params.eventRegistrationId || null,
      membership_payment_id: params.membershipPaymentId || null,
      participant_id: params.participantId || null,
      amount: params.amount,
      currency: params.currency || 'RUB',
      description: params.description || null,
      gateway_code: params.gatewayCode,
      status: 'pending',
      return_url: params.returnUrl,
      idempotency_key: idempotencyKey,
      metadata: params.metadata || {},
      created_by: params.createdBy || null,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
    })
    .select('*')
    .single()

  if (insertErr || !session) {
    logger.error({ error: insertErr?.message, params }, 'Failed to create payment session')
    throw new Error(`Failed to create payment session: ${insertErr?.message}`)
  }

  // Generate payment reference for bank transfers
  const paymentReference = generatePaymentReference(params.orgId, session.id)
  await db
    .from('payment_sessions')
    .update({ payment_reference: paymentReference })
    .eq('id', session.id)

  // Call gateway
  const gateway = getGateway(params.gatewayCode)
  const gatewayResult = await gateway.createPayment({
    amount: params.amount,
    currency: params.currency || 'RUB',
    description: params.description || `Оплата ${params.paymentFor === 'event' ? 'мероприятия' : 'подписки'}`,
    returnUrl: params.returnUrl,
    metadata: {
      session_id: session.id,
      org_id: params.orgId,
      payment_for: params.paymentFor,
      ...params.metadata,
    },
    idempotencyKey,
  })

  // Update session with gateway response
  const updates: Record<string, any> = {
    payment_reference: paymentReference,
  }

  if (gatewayResult.success) {
    if (gatewayResult.gatewayPaymentId) updates.gateway_payment_id = gatewayResult.gatewayPaymentId
    if (gatewayResult.redirectUrl) updates.payment_url = gatewayResult.redirectUrl
    updates.status = 'processing'
  } else {
    updates.status = 'failed'
    updates.error_message = gatewayResult.error
  }

  await db
    .from('payment_sessions')
    .update(updates)
    .eq('id', session.id)

  const updatedSession = { ...session, ...updates } as PaymentSession

  logger.info({
    session_id: session.id,
    org_id: params.orgId,
    gateway: params.gatewayCode,
    amount: params.amount,
    payment_for: params.paymentFor,
    status: updates.status,
  }, 'Payment initiated')

  return {
    session: updatedSession,
    redirectUrl: gatewayResult.redirectUrl,
    paymentReference,
    qrCodeUrl: gatewayResult.qrCodeUrl,
  }
}

// ─── Get Session ────────────────────────────────────────────────────

export async function getPaymentSession(sessionId: string): Promise<PaymentSession | null> {
  const db = createAdminServer()
  const { data, error } = await db
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !data) return null
  return data as PaymentSession
}

// ─── Handle Webhook ─────────────────────────────────────────────────

/**
 * Process a webhook from a payment gateway.
 * Finds matching session, updates status, records in ledger.
 */
export async function handlePaymentWebhook(
  gatewayCode: GatewayCode,
  rawBody: string,
  headers: Record<string, string>
): Promise<{ success: boolean; sessionId?: string }> {
  const db = createAdminServer()

  const gateway = getGateway(gatewayCode)
  const event = await gateway.handleWebhook(rawBody, headers)

  if (!event) {
    logger.warn({ gateway: gatewayCode }, 'Webhook verification failed or unknown event')
    return { success: false }
  }

  // Find session by gateway payment ID
  const { data: sessions } = await db
    .from('payment_sessions')
    .select('*')
    .eq('gateway_code', gatewayCode)
    .eq('gateway_payment_id', event.gatewayPaymentId)
    .limit(1)

  // If not found by gateway ID, try session_id from metadata
  let session: PaymentSession | null = null
  if (sessions && sessions.length > 0) {
    session = sessions[0] as PaymentSession
  } else if (event.metadata?.session_id) {
    const { data } = await db
      .from('payment_sessions')
      .select('*')
      .eq('id', event.metadata.session_id)
      .single()
    session = data as PaymentSession | null
  }

  if (!session) {
    logger.warn({ gateway: gatewayCode, payment_id: event.gatewayPaymentId }, 'No session found for webhook')
    return { success: false }
  }

  // Process based on event type
  if (event.type === 'payment.succeeded') {
    await markSessionSucceeded(session, event)
  } else if (event.type === 'payment.cancelled') {
    await db
      .from('payment_sessions')
      .update({
        status: 'cancelled',
        gateway_data: event.rawData || {},
      })
      .eq('id', session.id)
  } else if (event.type === 'refund.succeeded') {
    await db
      .from('payment_sessions')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        gateway_data: event.rawData || {},
      })
      .eq('id', session.id)
  }

  logger.info({
    session_id: session.id,
    event_type: event.type,
    gateway: gatewayCode,
  }, 'Webhook processed')

  return { success: true, sessionId: session.id }
}

// ─── Confirm Manual Payment ─────────────────────────────────────────

/**
 * Admin confirms a manual payment (bank transfer matched, cash received, etc.)
 */
export async function confirmManualPayment(
  sessionId: string,
  confirmedBy: string,
  paidAmount?: number
): Promise<PaymentSession> {
  const db = createAdminServer()

  const { data: session, error } = await db
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !session) {
    throw new Error('Payment session not found')
  }

  if (session.status === 'succeeded') {
    return session as PaymentSession // Already confirmed
  }

  if (session.status !== 'pending' && session.status !== 'processing') {
    throw new Error(`Cannot confirm session in status: ${session.status}`)
  }

  const amount = paidAmount || session.amount

  // Simulate a succeeded event
  await markSessionSucceeded(session as PaymentSession, {
    type: 'payment.succeeded',
    gatewayPaymentId: `manual_${sessionId}`,
    amount,
    currency: session.currency,
    metadata: { confirmed_by: confirmedBy },
  })

  const { data: updated } = await db
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  logger.info({ session_id: sessionId, confirmed_by: confirmedBy, amount }, 'Manual payment confirmed')
  return updated as PaymentSession
}

// ─── Reconcile Bank Transfer ────────────────────────────────────────

/**
 * Find and confirm a payment session by its payment reference (bank transfer reconciliation).
 */
export async function reconcileBankTransfer(
  paymentReference: string,
  confirmedBy: string,
  paidAmount?: number
): Promise<PaymentSession | null> {
  const db = createAdminServer()

  const { data: session } = await db
    .from('payment_sessions')
    .select('*')
    .eq('payment_reference', paymentReference)
    .in('status', ['pending', 'processing'])
    .single()

  if (!session) {
    logger.warn({ payment_reference: paymentReference }, 'No pending session found for bank transfer reference')
    return null
  }

  return confirmManualPayment(session.id, confirmedBy, paidAmount)
}

// ─── Process Refund ─────────────────────────────────────────────────

/**
 * Refund a succeeded payment (full or partial).
 */
export async function processRefund(
  sessionId: string,
  refundedBy: string,
  amount?: number,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const db = createAdminServer()

  const { data: session, error } = await db
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !session) {
    return { success: false, error: 'Payment session not found' }
  }

  if (session.status !== 'succeeded') {
    return { success: false, error: `Cannot refund session in status: ${session.status}` }
  }

  const refundAmount = amount || session.amount

  // Call gateway refund if not manual
  if (session.gateway_code !== 'manual' && session.gateway_payment_id) {
    const gateway = getGateway(session.gateway_code)
    const refundResult = await gateway.refund(session.gateway_payment_id, refundAmount)

    if (!refundResult.success) {
      return { success: false, error: refundResult.error }
    }
  }

  // Update session
  await db
    .from('payment_sessions')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      metadata: {
        ...session.metadata,
        refund_reason: reason,
        refunded_by: refundedBy,
        refund_amount: refundAmount,
      },
    })
    .eq('id', sessionId)

  // Record refund in ledger (negative amount) + commission reversal
  try {
    const idempotencyKey = `refund_${sessionId}`
    await db.raw(
      `SELECT * FROM record_simple_transaction($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12)`,
      [
        session.org_id,
        'refund',
        -refundAmount,
        session.currency,
        idempotencyKey,
        session.event_registration_id,
        session.membership_payment_id,
        session.event_id,
        session.participant_id,
        `Возврат: ${reason || 'без причины'}`,
        JSON.stringify({ session_id: sessionId }),
        refundedBy,
      ]
    )

    // Reverse commission on the refund
    const { data: accountData } = await db
      .from('org_accounts')
      .select('commission_rate')
      .eq('org_id', session.org_id)
      .single()

    const commissionRate = accountData ? parseFloat(accountData.commission_rate) : 0.05
    const commissionReversal = refundAmount * commissionRate

    if (commissionReversal > 0) {
      await db.raw(
        `SELECT * FROM record_simple_transaction($1, $2, $3, $4, $5, NULL, NULL, NULL, NULL, NULL, $6, $7, $8)`,
        [
          session.org_id,
          'commission_reversal',
          commissionReversal,
          session.currency,
          `comrev_${sessionId}`,
          'Возврат комиссии при рефанде',
          JSON.stringify({ session_id: sessionId }),
          refundedBy,
        ]
      )
    }
  } catch (ledgerErr: any) {
    logger.error({ session_id: sessionId, error: ledgerErr.message }, 'Failed to record refund in ledger')
    // Don't fail — the gateway refund already succeeded
  }

  logger.info({ session_id: sessionId, amount: refundAmount, reason }, 'Refund processed')
  return { success: true }
}

// ─── Poll Session Status ────────────────────────────────────────────

/**
 * Check gateway for latest status and update session if changed.
 * Used for client-side polling.
 */
export async function pollSessionStatus(sessionId: string): Promise<PaymentSession | null> {
  const db = createAdminServer()

  const { data: session } = await db
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) return null

  // If already terminal, no need to poll
  if (['succeeded', 'failed', 'cancelled', 'refunded'].includes(session.status)) {
    return session as PaymentSession
  }

  // If no gateway payment ID (manual), can't poll
  if (!session.gateway_payment_id || session.gateway_code === 'manual') {
    return session as PaymentSession
  }

  // Check with gateway
  const gateway = getGateway(session.gateway_code)
  const status = await gateway.checkStatus(session.gateway_payment_id)

  // If status changed to succeeded, process it
  if (status.paid && session.status !== 'succeeded') {
    await markSessionSucceeded(session as PaymentSession, {
      type: 'payment.succeeded',
      gatewayPaymentId: session.gateway_payment_id,
      amount: status.amount || session.amount,
      currency: status.currency || session.currency,
      metadata: {},
    })

    const { data: updated } = await db
      .from('payment_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    return updated as PaymentSession
  }

  // Update status if changed
  if (status.status !== session.status) {
    await db
      .from('payment_sessions')
      .update({
        status: status.status,
        gateway_data: status.gatewayData || {},
      })
      .eq('id', sessionId)
  }

  const { data: final } = await db
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  return final as PaymentSession
}

// ─── Internal: Mark Session Succeeded ───────────────────────────────

async function markSessionSucceeded(session: PaymentSession, event: WebhookEvent) {
  const db = createAdminServer()

  // Update session
  await db
    .from('payment_sessions')
    .update({
      status: 'succeeded',
      paid_at: new Date().toISOString(),
      gateway_data: event.rawData || {},
    })
    .eq('id', session.id)

  // Record in ledger
  try {
    if (session.payment_for === 'event' && session.event_registration_id) {
      await recordEventPayment({
        orgId: session.org_id,
        eventId: session.event_id!,
        eventRegistrationId: session.event_registration_id,
        participantId: session.participant_id!,
        amount: event.amount || session.amount,
        currency: session.currency,
        paymentGateway: session.gateway_code,
        externalPaymentId: event.gatewayPaymentId,
      })

      // Update event_registration payment status
      await db
        .from('event_registrations')
        .update({
          payment_status: 'paid',
          paid_amount: event.amount || session.amount,
          payment_method: session.gateway_code,
          paid_at: new Date().toISOString(),
        })
        .eq('id', session.event_registration_id)

    } else if (session.payment_for === 'membership' && session.membership_payment_id) {
      await recordMembershipPayment({
        orgId: session.org_id,
        membershipPaymentId: session.membership_payment_id,
        participantId: session.participant_id || undefined,
        amount: event.amount || session.amount,
        currency: session.currency,
        paymentGateway: session.gateway_code,
      })
    }
  } catch (ledgerErr: any) {
    logger.error({
      session_id: session.id,
      error: ledgerErr.message,
    }, 'Failed to record payment in ledger (session already marked succeeded)')
  }

  logger.info({
    session_id: session.id,
    org_id: session.org_id,
    amount: event.amount || session.amount,
    payment_for: session.payment_for,
    gateway: session.gateway_code,
  }, 'Payment succeeded')
}
