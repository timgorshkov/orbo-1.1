/**
 * Manual Payment Gateway
 * No API integration — admin confirms payments manually.
 * Supports bank transfer reconciliation via payment_reference.
 */

import type {
  PaymentGateway,
  CreatePaymentParams,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
  RefundResult,
} from '../paymentGateway'

export class ManualGateway implements PaymentGateway {
  readonly name = 'Ручная оплата'
  readonly code = 'manual' as const

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    return {
      success: true,
      // No redirect — user follows bank transfer instructions on the payment page
    }
  }

  async checkStatus(_gatewayPaymentId: string): Promise<PaymentStatus> {
    // Manual payments are tracked in payment_sessions table, not via gateway API
    return {
      status: 'pending',
      paid: false,
      amount: 0,
      currency: 'RUB',
    }
  }

  async handleWebhook(_rawBody: string, _headers: Record<string, string>): Promise<WebhookEvent | null> {
    // No webhooks for manual payments
    return null
  }

  async refund(_gatewayPaymentId: string, _amount?: number): Promise<RefundResult> {
    // Manual refunds are processed outside the system
    return {
      success: true,
      refundId: `manual_refund_${Date.now()}`,
    }
  }
}
