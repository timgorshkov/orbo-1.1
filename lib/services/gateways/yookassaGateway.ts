/**
 * YooKassa (ЮKassa) Payment Gateway
 *
 * API docs: https://yookassa.ru/developers/api
 * Supports: cards, SBP, YooMoney, bank transfers.
 *
 * Required env vars:
 *   YOOKASSA_SHOP_ID — магазин ID
 *   YOOKASSA_SECRET_KEY — секретный ключ
 *   YOOKASSA_WEBHOOK_SECRET — (optional) для верификации подписи вебхуков
 */

import { createServiceLogger } from '@/lib/logger'
import type {
  PaymentGateway,
  CreatePaymentParams,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
  RefundResult,
} from '../paymentGateway'

const logger = createServiceLogger('YookassaGateway')

const API_URL = 'https://api.yookassa.ru/v3'

function getCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID
  const secretKey = process.env.YOOKASSA_SECRET_KEY
  if (!shopId || !secretKey) {
    throw new Error('YooKassa credentials not configured (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY)')
  }
  return { shopId, secretKey }
}

function authHeader(): string {
  const { shopId, secretKey } = getCredentials()
  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64')
}

export class YookassaGateway implements PaymentGateway {
  readonly name = 'ЮKassa'
  readonly code = 'yookassa' as const

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const idempotencyKey = params.idempotencyKey || `yk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const body = {
        amount: {
          value: params.amount.toFixed(2),
          currency: params.currency || 'RUB',
        },
        confirmation: {
          type: 'redirect',
          return_url: params.returnUrl,
        },
        capture: true,
        description: params.description,
        metadata: params.metadata || {},
      }

      const res = await fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader(),
          'Content-Type': 'application/json',
          'Idempotence-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        logger.error({ status: res.status, body: errText }, 'YooKassa createPayment failed')
        return { success: false, error: `YooKassa API error: ${res.status}` }
      }

      const data = await res.json()

      return {
        success: true,
        gatewayPaymentId: data.id,
        redirectUrl: data.confirmation?.confirmation_url,
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'YooKassa createPayment exception')
      return { success: false, error: err.message }
    }
  }

  async checkStatus(gatewayPaymentId: string): Promise<PaymentStatus> {
    try {
      const res = await fetch(`${API_URL}/payments/${gatewayPaymentId}`, {
        headers: { 'Authorization': authHeader() },
      })

      if (!res.ok) {
        return { status: 'pending', paid: false, amount: 0, currency: 'RUB' }
      }

      const data = await res.json()
      const amount = parseFloat(data.amount?.value || '0')

      const statusMap: Record<string, PaymentStatus['status']> = {
        'pending': 'pending',
        'waiting_for_capture': 'processing',
        'succeeded': 'succeeded',
        'canceled': 'cancelled',
      }

      const refundedAmount = data.refunded_amount ? parseFloat(data.refunded_amount.value) : 0

      return {
        status: statusMap[data.status] || 'pending',
        paid: data.status === 'succeeded',
        amount,
        currency: data.amount?.currency || 'RUB',
        paidAt: data.captured_at || data.created_at,
        refunded: refundedAmount > 0,
        refundedAmount,
        gatewayData: data,
      }
    } catch (err: any) {
      logger.error({ error: err.message, payment_id: gatewayPaymentId }, 'YooKassa checkStatus failed')
      return { status: 'pending', paid: false, amount: 0, currency: 'RUB' }
    }
  }

  async handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent | null> {
    try {
      // YooKassa sends webhooks as JSON with IP-based verification
      // In production, verify source IP is from YooKassa ranges
      // For now, rely on webhook secret URL path
      const data = JSON.parse(rawBody)
      const event = data.event
      const payment = data.object

      if (!payment?.id) {
        logger.warn({ event }, 'YooKassa webhook: no payment id')
        return null
      }

      const typeMap: Record<string, WebhookEvent['type']> = {
        'payment.succeeded': 'payment.succeeded',
        'payment.waiting_for_capture': 'payment.waiting_for_capture',
        'payment.canceled': 'payment.cancelled',
        'refund.succeeded': 'refund.succeeded',
      }

      const mappedType = typeMap[event]
      if (!mappedType) {
        logger.warn({ event }, 'YooKassa webhook: unknown event type')
        return null
      }

      return {
        type: mappedType,
        gatewayPaymentId: payment.id,
        amount: parseFloat(payment.amount?.value || '0'),
        currency: payment.amount?.currency || 'RUB',
        metadata: payment.metadata || {},
        rawData: data,
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'YooKassa webhook parse error')
      return null
    }
  }

  async refund(gatewayPaymentId: string, amount?: number): Promise<RefundResult> {
    try {
      // First get payment to determine full amount if not specified
      let refundAmount = amount
      if (!refundAmount) {
        const status = await this.checkStatus(gatewayPaymentId)
        refundAmount = status.amount
      }

      const idempotencyKey = `yk_ref_${gatewayPaymentId}_${Date.now()}`

      const res = await fetch(`${API_URL}/refunds`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader(),
          'Content-Type': 'application/json',
          'Idempotence-Key': idempotencyKey,
        },
        body: JSON.stringify({
          payment_id: gatewayPaymentId,
          amount: {
            value: refundAmount!.toFixed(2),
            currency: 'RUB',
          },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        logger.error({ status: res.status, body: errText }, 'YooKassa refund failed')
        return { success: false, error: `YooKassa refund error: ${res.status}` }
      }

      const data = await res.json()
      return {
        success: true,
        refundId: data.id,
        amount: parseFloat(data.amount?.value || '0'),
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'YooKassa refund exception')
      return { success: false, error: err.message }
    }
  }
}
