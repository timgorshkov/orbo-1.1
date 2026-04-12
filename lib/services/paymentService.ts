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
import { recordEventPayment, recordMembershipPayment, recordEventPaymentV2 } from './orgAccountService'
import { calculateFees, getOrgFeeConfig, type CounterpartyType } from './feeCalculationService'
import { createPaymentReceipt, createRefundReceipt, getReceiptsBySession, sendReceiptToOrangeData } from './fiscalReceiptService'

const logger = createServiceLogger('PaymentService')

// ─── Types ──────────────────────────────────────────────────────────

export type PaymentFor = 'event' | 'membership' | 'subscription'
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
  /** Номинальная цена билета (без сервисного сбора) */
  ticket_price: number | null
  /** Сумма сервисного сбора */
  service_fee_amount: number | null
  /** Ставка сервисного сбора (снэпшот на момент оплаты) */
  service_fee_rate: number | null
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

  // Calculate fees for this org (only for event/membership payments — not for subscription,
  // which is Orbo's direct sale of its own license, not an agent model).
  let ticketPrice: number | null = null
  let serviceFeeAmount: number | null = null
  let serviceFeeRate: number | null = null

  if (params.paymentFor !== 'subscription') {
    try {
      const feeConfig = await getOrgFeeConfig(params.orgId)
      if (feeConfig.hasActiveContract) {
        const fees = calculateFees(params.amount, feeConfig.serviceFeeRate, feeConfig.agentCommissionRate)
        ticketPrice = fees.ticketPrice
        serviceFeeAmount = fees.serviceFeeAmount
        serviceFeeRate = feeConfig.serviceFeeRate
      }
    } catch (feeErr: any) {
      logger.warn({ org_id: params.orgId, error: feeErr.message }, 'Could not calculate fees, proceeding without')
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
      ticket_price: ticketPrice,
      service_fee_amount: serviceFeeAmount,
      service_fee_rate: serviceFeeRate,
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

  // Call gateway — append sessionId to returnUrl if it ends with placeholder
  const gateway = getGateway(params.gatewayCode)
  const finalReturnUrl = params.returnUrl.endsWith('sessionId=')
    ? `${params.returnUrl}${session.id}`
    : params.returnUrl
  const gatewayResult = await gateway.createPayment({
    amount: params.amount,
    currency: params.currency || 'RUB',
    description: params.description || `Оплата ${params.paymentFor === 'event' ? 'мероприятия' : 'подписки'}`,
    returnUrl: finalReturnUrl,
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
    return_url: finalReturnUrl,
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
    // Update session (may already be refunded if initiated via our processRefund)
    if (session.status !== 'refunded') {
      await db
        .from('payment_sessions')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          gateway_data: event.rawData || {},
        })
        .eq('id', session.id)

      // Also update event_registration if refund came from gateway dashboard
      if (session.event_registration_id) {
        await db
          .from('event_registrations')
          .update({
            payment_status: 'refunded',
            payment_updated_at: new Date().toISOString(),
          })
          .eq('id', session.event_registration_id)
      }
    }
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
  reason?: string
): Promise<{ success: boolean; error?: string; refundAmount?: number }> {
  const db = createAdminServer()

  const { data: session, error } = await db
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !session) {
    return { success: false, error: 'Платёжная сессия не найдена' }
  }

  if (session.status !== 'succeeded') {
    return { success: false, error: `Невозможно вернуть платёж в статусе: ${session.status}` }
  }

  // Determine refund amount: only ticket_price is refunded to participant,
  // service_fee stays with the platform (business decision for MVP).
  const ticketPrice = session.ticket_price != null
    ? parseFloat(session.ticket_price)
    : parseFloat(session.amount) // legacy fallback
  const serviceFeeAmount = session.service_fee_amount != null
    ? parseFloat(session.service_fee_amount)
    : 0

  // Check org balance — must have enough to cover refund
  const { data: balanceRow } = await db
    .from('org_transactions')
    .select('balance_after')
    .eq('org_id', session.org_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const currentBalance = balanceRow?.balance_after ?? 0

  // For legal entities with agent commission, we also reverse commission,
  // so the org needs: ticketPrice - agentCommission
  const feeConfig = await getOrgFeeConfig(session.org_id)
  const agentCommission = feeConfig.counterpartyType === 'legal_entity'
    ? ticketPrice * feeConfig.agentCommissionRate
    : 0
  const requiredBalance = ticketPrice - agentCommission

  if (currentBalance < requiredBalance) {
    return {
      success: false,
      error: `Недостаточно средств на балансе. Необходимо: ${requiredBalance.toFixed(2)} ₽, доступно: ${currentBalance.toFixed(2)} ₽`
    }
  }

  // Call gateway refund — refund only ticket_price (partial refund, service fee stays)
  if (session.gateway_code !== 'manual' && session.gateway_payment_id) {
    const gateway = getGateway(session.gateway_code)
    const refundResult = await gateway.refund(session.gateway_payment_id, ticketPrice)

    if (!refundResult.success) {
      return { success: false, error: `Ошибка шлюза: ${refundResult.error}` }
    }
  }

  // Update session status
  await db
    .from('payment_sessions')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      metadata: {
        ...session.metadata,
        refund_reason: reason,
        refunded_by: refundedBy,
        refund_amount: ticketPrice,
        service_fee_retained: serviceFeeAmount,
        agent_commission_reversed: agentCommission,
      },
    })
    .eq('id', sessionId)

  // Record refund in ledger
  try {
    // 1. Deduct ticket_price from org balance (refund to participant)
    await db.raw(
      `SELECT * FROM record_simple_transaction($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12)`,
      [
        session.org_id,
        'refund',
        -ticketPrice,
        session.currency,
        `refund_${sessionId}`,
        session.event_registration_id,
        session.membership_payment_id,
        session.event_id,
        session.participant_id,
        `Возврат стоимости билета: ${reason || 'по запросу организатора'}`,
        JSON.stringify({ session_id: sessionId, ticket_price: ticketPrice }),
        refundedBy,
      ]
    )

    // 2. For legal entities: reverse agent commission (return to org balance)
    if (agentCommission > 0) {
      await db.raw(
        `SELECT * FROM record_simple_transaction($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12)`,
        [
          session.org_id,
          'agent_commission_reversal',
          agentCommission,
          session.currency,
          `agcomrev_${sessionId}`,
          session.event_registration_id,
          session.membership_payment_id,
          session.event_id,
          session.participant_id,
          'Возврат агентского вознаграждения при рефанде',
          JSON.stringify({ session_id: sessionId }),
          refundedBy,
        ]
      )
    }

    // 3. Record service fee refund in platform_income (if table exists)
    // For MVP: service fee is NOT refunded to participant, but we track it
    // platform_income reversal will be added when fiscal receipts are implemented
  } catch (ledgerErr: any) {
    logger.error({ session_id: sessionId, error: ledgerErr.message }, 'Failed to record refund in ledger')
    // Don't fail — the gateway refund already succeeded
  }

  // Update event_registration payment status
  if (session.event_registration_id) {
    await db
      .from('event_registrations')
      .update({
        payment_status: 'refunded',
        payment_updated_at: new Date().toISOString(),
      })
      .eq('id', session.event_registration_id)
  }

  logger.info({
    session_id: sessionId,
    org_id: session.org_id,
    ticket_price: ticketPrice,
    service_fee_retained: serviceFeeAmount,
    agent_commission_reversed: agentCommission,
    reason,
  }, 'Refund processed')

  // --- Refund fiscal receipt (fire-and-forget) ---
  try {
    const originalReceipts = await getReceiptsBySession(sessionId)
    const originalReceipt = originalReceipts.find(r => r.receipt_type === 'income' && r.status === 'succeeded')
    if (originalReceipt) {
      const { getContractByOrgId } = await import('./contractService')
      const contract = await getContractByOrgId(session.org_id)
      const cp = (contract as any)?.counterparty
      const refundReceipt = await createRefundReceipt({
        orgId: session.org_id,
        originalReceiptId: originalReceipt.id,
        refundAmount: ticketPrice,
        ticketRefundAmount: ticketPrice,
        serviceFeeRefundAmount: 0, // service fee not refunded per business rules
        eventName: session.description || 'Мероприятие',
        supplierName: cp?.org_name || cp?.full_name || '',
        supplierInn: cp?.inn || '',
        customerEmail: originalReceipt.customer_email || undefined,
        customerPhone: originalReceipt.customer_phone || undefined,
      })
      if (refundReceipt) {
        sendReceiptToOrangeData(refundReceipt).catch(err =>
          logger.error({ receipt_id: refundReceipt.id, error: err.message }, 'Failed to send refund receipt')
        )
      }
    }
  } catch (receiptErr: any) {
    logger.error({ session_id: sessionId, error: receiptErr.message }, 'Failed to create refund fiscal receipt')
  }

  return { success: true, refundAmount: ticketPrice }
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
    const paidAmount = event.amount || session.amount

    if (session.payment_for === 'event' && session.event_registration_id) {
      // Use V2 recording if fee data available, otherwise fall back to V1
      if (session.ticket_price != null && session.service_fee_amount != null) {
        const feeConfig = await getOrgFeeConfig(session.org_id)
        await recordEventPaymentV2({
          orgId: session.org_id,
          eventId: session.event_id!,
          eventRegistrationId: session.event_registration_id,
          participantId: session.participant_id!,
          totalAmount: paidAmount,
          ticketPrice: session.ticket_price,
          serviceFeeAmount: session.service_fee_amount,
          counterpartyType: feeConfig.counterpartyType,
          currency: session.currency,
          paymentGateway: session.gateway_code,
          externalPaymentId: event.gatewayPaymentId,
        })
      } else {
        // Legacy path: no fee separation
        await recordEventPayment({
          orgId: session.org_id,
          eventId: session.event_id!,
          eventRegistrationId: session.event_registration_id,
          participantId: session.participant_id!,
          amount: paidAmount,
          currency: session.currency,
          paymentGateway: session.gateway_code,
          externalPaymentId: event.gatewayPaymentId,
        })
      }

      // Update event_registration payment status
      await db
        .from('event_registrations')
        .update({
          payment_status: 'paid',
          paid_amount: paidAmount,
          payment_method: session.gateway_code,
          paid_at: new Date().toISOString(),
        })
        .eq('id', session.event_registration_id)

    } else if (session.payment_for === 'membership' && session.membership_payment_id) {
      await recordMembershipPayment({
        orgId: session.org_id,
        membershipPaymentId: session.membership_payment_id,
        participantId: session.participant_id || undefined,
        amount: paidAmount,
        currency: session.currency,
        paymentGateway: session.gateway_code,
      })
    } else if (session.payment_for === 'subscription') {
      // Tariff plan payment — extend subscription, create invoice, act, and receipt
      const meta = (session.metadata || {}) as any
      const planCode = meta.plan_code || 'pro'

      const { addPayment } = await import('./billingService')
      await addPayment({
        orgId: session.org_id,
        amount: paidAmount,
        confirmedBy: session.created_by || 'system',
        planCode,
        paymentMethod: 'electronic',
        gatewayCode: session.gateway_code,
        paymentSessionId: session.id,
        customer: meta.customer ? {
          type: meta.customer.type || 'individual',
          name: meta.customer.name || '',
          inn: meta.customer.inn || null,
          email: meta.customer.email || null,
          phone: meta.customer.phone || null,
        } : undefined,
        generateReceipt: true, // always for card payments
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

  // --- Fiscal receipt (fire-and-forget, errors don't block payment) ---
  try {
    if (session.payment_for === 'event' && session.ticket_price != null && session.service_fee_amount != null) {
      const { getContractByOrgId } = await import('./contractService')
      const contract = await getContractByOrgId(session.org_id)
      const cp = (contract as any)?.counterparty
      if (cp?.inn) {
        const receipt = await createPaymentReceipt({
          orgId: session.org_id,
          paymentSessionId: session.id,
          eventRegistrationId: session.event_registration_id || undefined,
          totalAmount: parseFloat(session.amount as any),
          ticketPrice: parseFloat(session.ticket_price as any),
          serviceFeeAmount: parseFloat(session.service_fee_amount as any),
          eventName: session.description || 'Мероприятие',
          supplierName: cp.org_name || cp.full_name || '',
          supplierInn: cp.inn,
          supplierPhone: cp.phone || undefined,
          paymentMethod: 'electronic',
        })
        if (receipt) {
          sendReceiptToOrangeData(receipt).catch(err =>
            logger.error({ receipt_id: receipt.id, error: err.message }, 'Failed to send receipt to OrangeData')
          )
        }
      }
    }
  } catch (receiptErr: any) {
    logger.error({ session_id: session.id, error: receiptErr.message }, 'Failed to create fiscal receipt')
  }
}
