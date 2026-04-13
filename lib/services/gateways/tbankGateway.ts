/**
 * T-Bank (Tinkoff) Payment Gateway
 *
 * API docs: https://www.tbank.ru/kassa/dev/payments/
 * Supports: cards, SBP, T-Pay.
 *
 * Required env vars:
 *   TBANK_TERMINAL_KEY — терминал
 *   TBANK_SECRET_KEY — пароль терминала (для генерации токена)
 */

import { createHash } from 'crypto'
import { createServiceLogger } from '@/lib/logger'
import type {
  PaymentGateway,
  CreatePaymentParams,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
  RefundResult,
} from '../paymentGateway'

const logger = createServiceLogger('TbankGateway')

const API_URL = 'https://securepay.tinkoff.ru/v2'

function getCredentials() {
  const terminalKey = process.env.TBANK_TERMINAL_KEY
  const secretKey = process.env.TBANK_SECRET_KEY
  if (!terminalKey || !secretKey) {
    throw new Error('T-Bank credentials not configured (TBANK_TERMINAL_KEY, TBANK_SECRET_KEY)')
  }
  return { terminalKey, secretKey }
}

/**
 * Generate T-Bank token for request signing.
 * Token = SHA256 of concatenated sorted key-value pairs including Password.
 */
function generateToken(params: Record<string, any>): string {
  const { secretKey } = getCredentials()
  const signParams: Record<string, string> = { ...params, Password: secretKey }

  // Remove nested objects/arrays and Token itself
  const filtered = Object.entries(signParams)
    .filter(([_, v]) => typeof v !== 'object' && v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))

  const concatenated = filtered.map(([_, v]) => String(v)).join('')
  return createHash('sha256').update(concatenated).digest('hex')
}

export class TbankGateway implements PaymentGateway {
  readonly name = 'T-Bank'
  readonly code = 'tbank' as const

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const { terminalKey } = getCredentials()
      const orderId = params.idempotencyKey || `orb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const reqBody: Record<string, any> = {
        TerminalKey: terminalKey,
        Amount: Math.round(params.amount * 100), // T-Bank uses kopecks
        OrderId: orderId,
        Description: (params.description || '').slice(0, 140),
        SuccessURL: params.returnUrl,
        FailURL: params.returnUrl,
      }

      // T-Bank DATA requires flat { string -> string } object.
      // Nested objects/arrays are rejected with "Отсутствуют обязательные параметры".
      // Sanitize: flatten one level, stringify values, skip empty/null, enforce length limits.
      if (params.metadata) {
        const flatData: Record<string, string> = {}
        const addKV = (k: string, v: unknown) => {
          if (v === null || v === undefined || v === '') return
          // T-Bank: key ≤ 20 chars, value ≤ 100 chars, max 20 pairs
          const key = String(k).slice(0, 20)
          const val = String(v).slice(0, 100)
          if (Object.keys(flatData).length < 20) flatData[key] = val
        }
        for (const [k, v] of Object.entries(params.metadata)) {
          if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            // Flatten one level: customer.email, customer.name, etc.
            for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
              if (nv !== null && typeof nv !== 'object') addKV(`${k}_${nk}`, nv)
            }
          } else {
            addKV(k, v)
          }
        }
        if (Object.keys(flatData).length > 0) {
          reqBody.DATA = flatData
        }
      }

      reqBody.Token = generateToken(reqBody)

      const res = await fetch(`${API_URL}/Init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })

      const data = await res.json()

      if (!data.Success) {
        logger.error({ error_code: data.ErrorCode, message: data.Message }, 'T-Bank Init failed')
        return { success: false, error: data.Message || `T-Bank error: ${data.ErrorCode}` }
      }

      return {
        success: true,
        gatewayPaymentId: data.PaymentId?.toString(),
        redirectUrl: data.PaymentURL,
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'T-Bank createPayment exception')
      return { success: false, error: err.message }
    }
  }

  async checkStatus(gatewayPaymentId: string): Promise<PaymentStatus> {
    try {
      const { terminalKey } = getCredentials()
      const reqBody: Record<string, any> = {
        TerminalKey: terminalKey,
        PaymentId: gatewayPaymentId,
      }
      reqBody.Token = generateToken(reqBody)

      const res = await fetch(`${API_URL}/GetState`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })

      const data = await res.json()

      if (!data.Success) {
        return { status: 'pending', paid: false, amount: 0, currency: 'RUB' }
      }

      const statusMap: Record<string, PaymentStatus['status']> = {
        'NEW': 'pending',
        'FORM_SHOWED': 'pending',
        'AUTHORIZING': 'processing',
        'AUTHORIZED': 'processing',
        'CONFIRMING': 'processing',
        'CONFIRMED': 'succeeded',
        'REVERSED': 'cancelled',
        'REFUNDING': 'processing',
        'PARTIAL_REFUNDED': 'succeeded',
        'REFUNDED': 'refunded',
        'REJECTED': 'failed',
        'DEADLINE_EXPIRED': 'cancelled',
        'CANCELED': 'cancelled',
      }

      const amount = (data.Amount || 0) / 100 // kopecks → rubles

      return {
        status: statusMap[data.Status] || 'pending',
        paid: data.Status === 'CONFIRMED',
        amount,
        currency: 'RUB',
        paidAt: data.Status === 'CONFIRMED' ? new Date().toISOString() : undefined,
        gatewayData: data,
      }
    } catch (err: any) {
      logger.error({ error: err.message, payment_id: gatewayPaymentId }, 'T-Bank checkStatus failed')
      return { status: 'pending', paid: false, amount: 0, currency: 'RUB' }
    }
  }

  async handleWebhook(rawBody: string, _headers: Record<string, string>): Promise<WebhookEvent | null> {
    try {
      const data = JSON.parse(rawBody)

      // Verify token
      const { Token, ...rest } = data
      const expectedToken = generateToken(rest)
      if (Token !== expectedToken) {
        logger.warn({}, 'T-Bank webhook: invalid token')
        return null
      }

      const status = data.Status
      const paymentId = data.PaymentId?.toString()

      if (!paymentId) {
        logger.warn({ status }, 'T-Bank webhook: no PaymentId')
        return null
      }

      const typeMap: Record<string, WebhookEvent['type']> = {
        'CONFIRMED': 'payment.succeeded',
        'AUTHORIZED': 'payment.waiting_for_capture',
        'REJECTED': 'payment.cancelled',
        'CANCELED': 'payment.cancelled',
        'REFUNDED': 'refund.succeeded',
        'PARTIAL_REFUNDED': 'refund.succeeded',
      }

      const mappedType = typeMap[status]
      if (!mappedType) {
        logger.info({ status, payment_id: paymentId }, 'T-Bank webhook: intermediate status, skipping')
        return null
      }

      const amount = (data.Amount || 0) / 100

      return {
        type: mappedType,
        gatewayPaymentId: paymentId,
        amount,
        currency: 'RUB',
        metadata: data.DATA || {},
        rawData: data,
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'T-Bank webhook parse error')
      return null
    }
  }

  async refund(gatewayPaymentId: string, amount?: number): Promise<RefundResult> {
    try {
      const { terminalKey } = getCredentials()

      const reqBody: Record<string, any> = {
        TerminalKey: terminalKey,
        PaymentId: gatewayPaymentId,
      }

      if (amount) {
        reqBody.Amount = Math.round(amount * 100)
      }

      reqBody.Token = generateToken(reqBody)

      const res = await fetch(`${API_URL}/Cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })

      const data = await res.json()

      if (!data.Success) {
        logger.error({ error_code: data.ErrorCode, message: data.Message }, 'T-Bank refund failed')
        return { success: false, error: data.Message || `T-Bank error: ${data.ErrorCode}` }
      }

      return {
        success: true,
        refundId: data.PaymentId?.toString(),
        amount: (data.Amount || 0) / 100,
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'T-Bank refund exception')
      return { success: false, error: err.message }
    }
  }
}
