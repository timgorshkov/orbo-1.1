/**
 * PaymentGateway — abstract interface for payment providers.
 * Phase 3 stub: currently only manual/external payment links are supported.
 * Future adapters: Prodamus, YooKassa, T-Bank.
 */

export interface PaymentResult {
  success: boolean
  paymentId?: string
  redirectUrl?: string
  error?: string
}

export interface PaymentStatus {
  paid: boolean
  amount: number
  currency: string
  paidAt?: string
  refunded?: boolean
}

export interface WebhookEvent {
  type: 'payment.succeeded' | 'payment.failed' | 'payment.refunded'
  paymentId: string
  amount: number
  currency: string
  metadata: Record<string, any>
}

export interface PaymentGateway {
  readonly name: string
  readonly code: string

  /**
   * Create a payment session and return a redirect URL for the user.
   */
  createPayment(params: {
    amount: number
    currency: string
    description: string
    membershipId: string
    returnUrl: string
    metadata?: Record<string, any>
  }): Promise<PaymentResult>

  /**
   * Check the status of a previously created payment.
   */
  checkStatus(paymentId: string): Promise<PaymentStatus>

  /**
   * Process a webhook callback from the payment provider.
   * Returns the parsed event, or null if the signature is invalid.
   */
  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent | null>
}

// ─── Manual / External Payment (stub) ────────────────────────────────

export const PRODAMUS_REF_URL = 'https://connect.prodamus.ru/?ref=ORBOPARTNERS&c=Rw6'

/**
 * ManualPaymentGateway: No API integration; admin confirms payments manually.
 * The payment link in the membership plan settings directs users to an external
 * payment page (Prodamus form, bank transfer page, etc.).
 */
export class ManualPaymentGateway implements PaymentGateway {
  readonly name = 'Ручная оплата'
  readonly code = 'manual'

  async createPayment(params: {
    amount: number
    currency: string
    description: string
    membershipId: string
    returnUrl: string
  }): Promise<PaymentResult> {
    // No API call — return the plan's payment link or instructions
    return { success: true, redirectUrl: undefined }
  }

  async checkStatus(_paymentId: string): Promise<PaymentStatus> {
    return { paid: false, amount: 0, currency: 'RUB' }
  }

  async handleWebhook(_rawBody: string, _headers: Record<string, string>): Promise<WebhookEvent | null> {
    return null
  }
}

// ─── Future: Prodamus Gateway (placeholder) ──────────────────────────

// export class ProdamusGateway implements PaymentGateway {
//   readonly name = 'Prodamus'
//   readonly code = 'prodamus'
//   constructor(private apiKey: string, private shopId: string) {}
//   async createPayment(params) { /* ... */ }
//   async checkStatus(paymentId) { /* ... */ }
//   async handleWebhook(rawBody, headers) { /* ... */ }
// }

// ─── Future: YooKassa Gateway (placeholder) ──────────────────────────

// export class YooKassaGateway implements PaymentGateway {
//   readonly name = 'ЮKassa'
//   readonly code = 'yookassa'
//   constructor(private shopId: string, private secretKey: string) {}
//   async createPayment(params) { /* ... */ }
//   async checkStatus(paymentId) { /* ... */ }
//   async handleWebhook(rawBody, headers) { /* ... */ }
// }
