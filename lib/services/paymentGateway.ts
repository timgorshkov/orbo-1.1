/**
 * PaymentGateway — abstract interface for payment providers.
 *
 * Supported gateways:
 * - manual: admin confirms payments manually (bank transfer, cash, external links)
 * - yookassa: YooKassa (ЮKassa) — cards, SBP, wallets
 * - tbank: T-Bank (Tinkoff) — cards, SBP
 * - cloudpayments: CloudPayments — cards via the Pay Widget (client-side)
 *
 * Each gateway implements createPayment, checkStatus, handleWebhook, and refund.
 */

// ─── Shared Types ───────────────────────────────────────────────────

export type GatewayCode = 'manual' | 'yookassa' | 'tbank' | 'sbp' | 'cloudpayments'

export interface CreatePaymentParams {
  amount: number
  currency: string
  description: string
  returnUrl: string
  metadata?: Record<string, any>
  /** Idempotency key to prevent duplicate payments */
  idempotencyKey?: string
  /** For SBP: phone number hint */
  phone?: string
}

export interface PaymentResult {
  success: boolean
  /** Gateway-assigned payment ID */
  gatewayPaymentId?: string
  /** URL to redirect the user to */
  redirectUrl?: string
  /** For SBP: QR code data/image URL */
  qrCodeUrl?: string
  /** For bank transfer: payment reference */
  paymentReference?: string
  error?: string
}

export interface PaymentStatus {
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
  paid: boolean
  amount: number
  currency: string
  paidAt?: string
  refunded?: boolean
  refundedAmount?: number
  gatewayData?: Record<string, any>
}

export interface WebhookEvent {
  type: 'payment.succeeded' | 'payment.waiting_for_capture' | 'payment.cancelled' | 'refund.succeeded'
  gatewayPaymentId: string
  amount: number
  currency: string
  metadata: Record<string, any>
  rawData?: any
}

export interface RefundResult {
  success: boolean
  refundId?: string
  amount?: number
  error?: string
}

// ─── Gateway Interface ──────────────────────────────────────────────

export interface PaymentGateway {
  readonly name: string
  readonly code: GatewayCode

  /** Create a payment and return redirect URL or QR data */
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>

  /** Check current payment status by gateway payment ID */
  checkStatus(gatewayPaymentId: string): Promise<PaymentStatus>

  /** Process webhook callback; returns parsed event or null if invalid signature */
  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent | null>

  /** Refund a payment (full or partial) */
  refund(gatewayPaymentId: string, amount?: number): Promise<RefundResult>
}

// ─── Gateway Registry ───────────────────────────────────────────────

const gatewayRegistry = new Map<GatewayCode, () => PaymentGateway>()

export function registerGateway(code: GatewayCode, factory: () => PaymentGateway) {
  gatewayRegistry.set(code, factory)
}

export function getGateway(code: GatewayCode): PaymentGateway {
  const factory = gatewayRegistry.get(code)
  if (!factory) {
    throw new Error(`Payment gateway not registered: ${code}`)
  }
  return factory()
}

export function getAvailableGateways(): GatewayCode[] {
  return Array.from(gatewayRegistry.keys())
}

// ─── Register built-in gateways ─────────────────────────────────────

// Manual gateway is always available
registerGateway('manual', () => {
  const { ManualGateway } = require('./gateways/manualGateway')
  return new ManualGateway()
})

// YooKassa — available if credentials are set
if (process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
  registerGateway('yookassa', () => {
    const { YookassaGateway } = require('./gateways/yookassaGateway')
    return new YookassaGateway()
  })
}

// T-Bank — available if credentials are set
if (process.env.TBANK_TERMINAL_KEY && process.env.TBANK_SECRET_KEY) {
  registerGateway('tbank', () => {
    const { TbankGateway } = require('./gateways/tbankGateway')
    return new TbankGateway()
  })
}

// CloudPayments — available if credentials are set
if (process.env.CLOUDPAYMENTS_PUBLIC_ID && process.env.CLOUDPAYMENTS_API_SECRET) {
  registerGateway('cloudpayments', () => {
    const { CloudPaymentsGateway } = require('./gateways/cloudpaymentsGateway')
    return new CloudPaymentsGateway()
  })
}
