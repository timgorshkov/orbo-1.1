/**
 * CloudPayments Payment Gateway
 *
 * API docs: https://developers.cloudpayments.ru/
 *
 * Integration model used here:
 *   • Acquiring is done client-side via the CloudPayments Pay Widget. The widget
 *     collects card data on cp.ru pages, so PCI scope stays minimal.
 *   • Server side we do NOT call CloudPayments at session creation. We just
 *     persist the payment_session and let our pay-page open the widget once the
 *     user is on it. createPayment() therefore returns success with NO
 *     redirectUrl — the pay-page detects gateway_code='cloudpayments' and
 *     renders the widget directly.
 *   • Webhook arrives via CloudPayments Pay/Fail/Cancel/Refund notifications.
 *     Body is application/x-www-form-urlencoded, signature is sent in the
 *     `Content-Hmac` header (Base64 HMAC-SHA256 of the raw body using ApiSecret).
 *   • OrderId we pass to the widget is the payment_session.id (UUID) — webhook
 *     handler resolves the session via metadata.session_id.
 *
 * Required env vars:
 *   CLOUDPAYMENTS_PUBLIC_ID   — public ID (used in widget on the client too)
 *   CLOUDPAYMENTS_API_SECRET  — API secret (used to verify webhooks server-side)
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceLogger } from '@/lib/logger'
import type {
  PaymentGateway,
  CreatePaymentParams,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
  RefundResult,
} from '../paymentGateway'

const logger = createServiceLogger('CloudPaymentsGateway')

const API_URL = 'https://api.cloudpayments.ru'

function getCredentials() {
  const publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID
  const apiSecret = process.env.CLOUDPAYMENTS_API_SECRET
  if (!publicId || !apiSecret) {
    throw new Error('CloudPayments credentials not configured (CLOUDPAYMENTS_PUBLIC_ID, CLOUDPAYMENTS_API_SECRET)')
  }
  return { publicId, apiSecret }
}

/**
 * Auth header for CloudPayments REST API (refund, status, recurrent charge, ...).
 * CP uses HTTP Basic with publicId:apiSecret. The header is built per-request to
 * avoid leaking creds via shared mutable state.
 */
function authHeader(): string {
  const { publicId, apiSecret } = getCredentials()
  return 'Basic ' + Buffer.from(`${publicId}:${apiSecret}`).toString('base64')
}

/**
 * Verify the HMAC signature of a CloudPayments webhook. Exported so the route
 * handler can short-circuit "intermediate" events (e.g. Check, Confirm) with a
 * `{code: 0}` response — even though the adapter's handleWebhook returns null
 * for such events, the signature itself was valid and we don't want CP to
 * treat a valid Check as a rejection.
 */
export function verifyCloudPaymentsSignature(rawBody: string, headers: Record<string, string>): boolean {
  try {
    const { apiSecret } = getCredentials()
    const lower: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v
    const signature = lower['content-hmac'] || lower['x-content-hmac']
    if (!signature) return false
    const expected = createHmac('sha256', apiSecret).update(rawBody, 'utf8').digest('base64')
    const sigBuf = Buffer.from(signature, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    if (sigBuf.length !== expBuf.length) return false
    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

/**
 * CloudPayments REST responses follow the shape:
 *   { Success: boolean, Message?: string, Model?: any }
 */
async function cpFetch<T = any>(path: string, body: Record<string, any>): Promise<{ Success: boolean; Message?: string; Model?: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ Success: boolean; Message?: string; Model?: T }>
}

/**
 * Map CloudPayments transaction status to our internal PaymentStatus['status'].
 * Status values come from /payments/get and from webhook payloads.
 */
function mapCpStatus(s: string | undefined): PaymentStatus['status'] {
  switch (s) {
    case 'Completed':
      return 'succeeded'
    case 'Authorized':
      return 'processing'
    case 'Cancelled':
      return 'cancelled'
    case 'Declined':
      return 'failed'
    case 'Refunded':
      return 'refunded'
    case 'AwaitingAuthentication':
    case 'Pending':
    default:
      return 'pending'
  }
}

export class CloudPaymentsGateway implements PaymentGateway {
  readonly name = 'CloudPayments'
  readonly code = 'cloudpayments' as const

  /**
   * No-op on the gateway side — the actual charge happens later in the browser
   * via the Pay Widget. We just confirm credentials are in place; if not, fail
   * fast so the caller sees an obvious error instead of an empty session.
   */
  async createPayment(_params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      getCredentials() // validates env-vars are configured
      return { success: true }
    } catch (err: any) {
      logger.error({ error: err.message }, 'CloudPayments createPayment: not configured')
      return { success: false, error: err.message }
    }
  }

  async checkStatus(gatewayPaymentId: string): Promise<PaymentStatus> {
    try {
      const transactionIdNum = Number(gatewayPaymentId)
      if (!Number.isFinite(transactionIdNum)) {
        return { status: 'pending', paid: false, amount: 0, currency: 'RUB' }
      }

      const data = await cpFetch<any>('/payments/get', { TransactionId: transactionIdNum })
      if (!data.Success || !data.Model) {
        return { status: 'pending', paid: false, amount: 0, currency: 'RUB' }
      }

      const m = data.Model
      const cpStatus = mapCpStatus(m.Status)
      return {
        status: cpStatus,
        paid: cpStatus === 'succeeded',
        amount: Number(m.Amount) || 0,
        currency: m.Currency || 'RUB',
        paidAt: m.AuthDateIso || m.ConfirmDateIso,
        gatewayData: m,
      }
    } catch (err: any) {
      logger.error({ error: err.message, payment_id: gatewayPaymentId }, 'CloudPayments checkStatus failed')
      return { status: 'pending', paid: false, amount: 0, currency: 'RUB' }
    }
  }

  /**
   * Verify CloudPayments webhook signature (HMAC-SHA256 of raw body,
   * Base64-encoded, transmitted in the `Content-Hmac` header) and convert the
   * CP-style payload into our internal WebhookEvent shape.
   *
   * Body is application/x-www-form-urlencoded; raw body is parsed via
   * URLSearchParams. We do NOT call request.json() upstream — the route handler
   * passes raw text.
   *
   * Distinguishing event types:
   *   - Pay:    has `Status='Completed'` (or `Authorized`) and TransactionId
   *   - Fail:   has `Status='Declined'`
   *   - Cancel: has `Status='Cancelled'`
   *   - Refund: has `PaymentTransactionId` (the original payment) +
   *             `TransactionId` (the refund itself)
   * CloudPayments delivers each kind to a separate URL configured in their
   * dashboard; here we accept any of them on a single endpoint and disambiguate
   * by payload content.
   */
  async handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent | null> {
    try {
      if (!verifyCloudPaymentsSignature(rawBody, headers)) {
        logger.warn({}, 'CloudPayments webhook: invalid signature')
        return null
      }

      const params = new URLSearchParams(rawBody)
      const data: Record<string, string> = {}
      params.forEach((v, k) => { data[k] = v })

      // OrderId is the payment_session.id we passed to the widget. Pass it
      // through metadata so paymentService.handlePaymentWebhook can look the
      // session up even if gateway_payment_id wasn't stored at session creation.
      const sessionIdFromOrder = data.InvoiceId || data.OrderId || ''
      const transactionId = data.TransactionId || ''
      const refundedTransactionId = data.PaymentTransactionId || ''
      const status = data.Status || ''
      const amount = Number(data.Amount || 0)
      const currency = data.Currency || 'RUB'

      const isRefund = !!refundedTransactionId && refundedTransactionId !== transactionId
      const isCancelled = status === 'Cancelled'
      const isDeclined = status === 'Declined'
      const isSucceeded = status === 'Completed'

      let mappedType: WebhookEvent['type']
      let resolvedGatewayId = transactionId
      if (isRefund) {
        mappedType = 'refund.succeeded'
        // For refund webhooks, the payment we want to find is the ORIGINAL one
        resolvedGatewayId = refundedTransactionId
      } else if (isSucceeded) {
        mappedType = 'payment.succeeded'
      } else if (isDeclined || isCancelled) {
        mappedType = 'payment.cancelled'
      } else {
        logger.info({ status, transaction_id: transactionId }, 'CloudPayments webhook: intermediate status, skipping')
        return null
      }

      // CloudPayments returns Token / SubscriptionId for cards saved for
      // recurring use. We forward them via metadata so the recurring billing
      // (later phase) can pick them up without parsing rawData again.
      const metadata: Record<string, any> = {
        session_id: sessionIdFromOrder || undefined,
      }
      if (data.Token) metadata.cp_token = data.Token
      if (data.SubscriptionId) metadata.cp_subscription_id = data.SubscriptionId

      return {
        type: mappedType,
        gatewayPaymentId: resolvedGatewayId,
        amount,
        currency,
        metadata,
        rawData: data,
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'CloudPayments webhook parse error')
      return null
    }
  }

  /**
   * Charge a previously-saved card token (recurring payment).
   *
   * CloudPayments endpoint: POST /payments/tokens/charge
   * Behaviour: synchronous in the response (Success/Model.Status) AND a
   * regular Pay/Fail webhook is also delivered. We rely on the webhook for
   * the canonical success path so accounting stays in one place; the return
   * value here is mainly used by the cron to decide whether to retry now or
   * mark the token as failed.
   *
   * Returns { success: true, gatewayPaymentId } when CP confirmed the charge.
   * Returns { success: false, error } on any failure (declined card, network).
   */
  async chargeWithToken(params: {
    token: string
    amount: number
    currency: string
    description: string
    invoiceId: string
    accountId: string
    email?: string
  }): Promise<PaymentResult> {
    try {
      const reqBody: Record<string, any> = {
        Amount: params.amount,
        Currency: params.currency || 'RUB',
        AccountId: params.accountId,
        Token: params.token,
        Description: params.description.slice(0, 256),
        InvoiceId: params.invoiceId,
      }
      if (params.email) reqBody.Email = params.email

      const data = await cpFetch<any>('/payments/tokens/charge', reqBody)
      if (!data.Success) {
        logger.warn({
          invoice_id: params.invoiceId,
          message: data.Message,
        }, 'CloudPayments token charge declined')
        return { success: false, error: data.Message || 'Token charge declined' }
      }

      const transactionId = data.Model?.TransactionId?.toString()
      if (!transactionId) {
        return { success: false, error: 'CloudPayments did not return TransactionId' }
      }

      logger.info({
        invoice_id: params.invoiceId,
        transaction_id: transactionId,
        amount: params.amount,
      }, 'CloudPayments token charge accepted (webhook will follow)')

      return { success: true, gatewayPaymentId: transactionId }
    } catch (err: any) {
      logger.error({ error: err.message, invoice_id: params.invoiceId }, 'CloudPayments token charge exception')
      return { success: false, error: err.message }
    }
  }

  async refund(gatewayPaymentId: string, amount?: number): Promise<RefundResult> {
    try {
      const transactionIdNum = Number(gatewayPaymentId)
      if (!Number.isFinite(transactionIdNum)) {
        return { success: false, error: `Invalid TransactionId: ${gatewayPaymentId}` }
      }

      const reqBody: Record<string, any> = { TransactionId: transactionIdNum }
      if (amount) reqBody.Amount = amount // CloudPayments expects rubles, not kopecks

      const data = await cpFetch<any>('/payments/refund', reqBody)
      if (!data.Success) {
        logger.error({ message: data.Message, payment_id: gatewayPaymentId }, 'CloudPayments refund failed')
        return { success: false, error: data.Message || 'CloudPayments refund failed' }
      }

      return {
        success: true,
        refundId: data.Model?.TransactionId?.toString(),
        amount: Number(data.Model?.Amount) || amount,
      }
    } catch (err: any) {
      logger.error({ error: err.message, payment_id: gatewayPaymentId }, 'CloudPayments refund exception')
      return { success: false, error: err.message }
    }
  }
}
