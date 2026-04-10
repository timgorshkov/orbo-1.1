/**
 * Fiscal Receipt Service
 *
 * Формирование и отправка фискальных чеков (54-ФЗ) через OrangeData (облачная ККТ).
 *
 * Типы чеков:
 * 1. Оплата билета — агентская модель: билет (поставщик = организатор) + сервисный сбор (доход ОРБО)
 * 2. Возврат билета — income_return
 * 3. Оплата подписки — собственная реализация ОРБО (1 позиция, без агентских тегов)
 *
 * Lifecycle: created → pending (отправлен в OrangeData) → succeeded (фискализирован) | failed
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import {
  isConfigured as isOrangeDataConfigured,
  getInn,
  createDocument,
  getDocumentStatus,
  type OrangeDataDocument,
  type OrangeDataPosition,
} from './orangeDataClient'

const logger = createServiceLogger('FiscalReceiptService')

// ─── Types ──────────────────────────────────────────────────────────

export interface ReceiptItem {
  name: string
  amount: number
  quantity: number
  vat_rate: string
  vat_amount: number
  is_agent_item: boolean
  supplier_name?: string
  supplier_inn?: string
  supplier_phone?: string
  payment_method_type: string
  payment_subject_type: string
}

export type ReceiptType = 'income' | 'income_return' | 'expense' | 'correction'
export type ReceiptStatus = 'created' | 'pending' | 'succeeded' | 'failed' | 'cancelled'

export interface FiscalReceipt {
  id: string
  org_id: string
  payment_session_id: string | null
  event_registration_id: string | null
  receipt_type: ReceiptType
  status: ReceiptStatus
  total_amount: number
  currency: string
  items: ReceiptItem[]
  payment_method: string | null
  customer_email: string | null
  customer_phone: string | null
  original_receipt_id: string | null
  metadata: Record<string, any> | null
  error_message: string | null
  retry_count: number
  // OFD response fields
  ofd_provider: string | null
  fiscal_document_number: string | null
  fiscal_sign: string | null
  fiscal_receipt_number: number | null
  shift_number: number | null
  fn_number: string | null
  kkt_reg_number: string | null
  ofd_receipt_url: string | null
  ofd_response: any
  created_at: string
  updated_at: string
}

// ─── ОРБО company data ─────────────────────────────────────────────

const ORBO_INN = '9701327025'
const TAXATION_SYSTEM = 1 // УСН доходы

// ─── VAT / Payment mapping for OrangeData ──────────────────────────

const VAT_MAP: Record<string, number> = {
  'none': 6,   // без НДС
  '0': 5,      // 0%
  '5': 12,     // 5% (USN)
  '7': 13,     // 7% (USN)
  '10': 2,     // 10%
  '20': 1,     // 20%
  '22': 1,     // 22% (alias for 20%)
}

const PAYMENT_METHOD_MAP: Record<string, number> = {
  'full_prepayment': 1,
  'prepayment': 2,
  'advance': 3,
  'full_payment': 4,
}

const PAYMENT_SUBJECT_MAP: Record<string, number> = {
  'commodity': 1,
  'work': 3,
  'service': 4,
}

const PAYMENT_TYPE_MAP: Record<string, number> = {
  'cash': 1,
  'electronic': 2,
  'card': 2,
  'prepaid': 14,
}

// ─── Create Receipts ────────────────────────────────────────────────

/**
 * Создаёт фискальный чек при оплате билета (агентская модель).
 */
export async function createPaymentReceipt(params: {
  orgId: string
  paymentSessionId: string
  eventRegistrationId?: string
  totalAmount: number
  ticketPrice: number
  serviceFeeAmount: number
  eventName: string
  supplierName: string
  supplierInn: string
  supplierPhone?: string
  customerEmail?: string
  customerPhone?: string
  paymentMethod?: string
}): Promise<FiscalReceipt | null> {
  const db = createAdminServer()

  const items: ReceiptItem[] = []

  if (params.ticketPrice > 0) {
    items.push({
      name: `Услуга участия — «${params.eventName}»`.slice(0, 128),
      amount: params.ticketPrice,
      quantity: 1,
      vat_rate: 'none',
      vat_amount: 0,
      is_agent_item: true,
      supplier_name: params.supplierName,
      supplier_inn: params.supplierInn,
      supplier_phone: params.supplierPhone,
      payment_method_type: 'full_payment',
      payment_subject_type: 'service',
    })
  }

  if (params.serviceFeeAmount > 0) {
    items.push({
      name: 'Сервисный сбор Orbo',
      amount: params.serviceFeeAmount,
      quantity: 1,
      vat_rate: 'none',
      vat_amount: 0,
      is_agent_item: false,
      payment_method_type: 'full_payment',
      payment_subject_type: 'service',
    })
  }

  const { data, error } = await db
    .from('fiscal_receipts')
    .insert({
      org_id: params.orgId,
      payment_session_id: params.paymentSessionId,
      event_registration_id: params.eventRegistrationId || null,
      receipt_type: 'income',
      status: 'created',
      total_amount: params.totalAmount,
      currency: 'RUB',
      items: JSON.stringify(items),
      payment_method: params.paymentMethod || 'electronic',
      customer_email: params.customerEmail || null,
      customer_phone: params.customerPhone || null,
      metadata: JSON.stringify({ payment_for: 'event' }),
    })
    .select('*')
    .single()

  if (error) {
    logger.error({ error: error.message, session_id: params.paymentSessionId }, 'Failed to create payment receipt')
    return null
  }

  logger.info({ receipt_id: data.id, session_id: params.paymentSessionId, total: params.totalAmount }, 'Payment receipt created')
  return parseReceipt(data)
}

/**
 * Создаёт чек возврата прихода.
 */
export async function createRefundReceipt(params: {
  orgId: string
  originalReceiptId: string
  refundAmount: number
  ticketRefundAmount: number
  serviceFeeRefundAmount: number
  eventName: string
  supplierName: string
  supplierInn: string
  customerEmail?: string
  customerPhone?: string
}): Promise<FiscalReceipt | null> {
  const db = createAdminServer()

  const items: ReceiptItem[] = []

  if (params.ticketRefundAmount > 0) {
    items.push({
      name: `Возврат — «${params.eventName}»`.slice(0, 128),
      amount: params.ticketRefundAmount,
      quantity: 1,
      vat_rate: 'none',
      vat_amount: 0,
      is_agent_item: true,
      supplier_name: params.supplierName,
      supplier_inn: params.supplierInn,
      payment_method_type: 'full_payment',
      payment_subject_type: 'service',
    })
  }

  if (params.serviceFeeRefundAmount > 0) {
    items.push({
      name: 'Возврат сервисного сбора Orbo',
      amount: params.serviceFeeRefundAmount,
      quantity: 1,
      vat_rate: 'none',
      vat_amount: 0,
      is_agent_item: false,
      payment_method_type: 'full_payment',
      payment_subject_type: 'service',
    })
  }

  const totalRefund = params.ticketRefundAmount + params.serviceFeeRefundAmount

  const { data, error } = await db
    .from('fiscal_receipts')
    .insert({
      org_id: params.orgId,
      receipt_type: 'income_return',
      status: 'created',
      total_amount: totalRefund,
      currency: 'RUB',
      items: JSON.stringify(items),
      payment_method: 'electronic',
      customer_email: params.customerEmail || null,
      customer_phone: params.customerPhone || null,
      original_receipt_id: params.originalReceiptId,
      metadata: JSON.stringify({ payment_for: 'event_refund' }),
    })
    .select('*')
    .single()

  if (error) {
    logger.error({ error: error.message }, 'Failed to create refund receipt')
    return null
  }

  logger.info({ receipt_id: data.id, original_id: params.originalReceiptId }, 'Refund receipt created')
  return parseReceipt(data)
}

/**
 * Создаёт чек при оплате подписки (собственная реализация ОРБО, без агентских тегов).
 */
export async function createSubscriptionReceipt(params: {
  orgId: string
  amount: number
  planName: string
  customerEmail?: string
  customerPhone?: string
  paymentMethod?: string
  metadata?: Record<string, any>
}): Promise<FiscalReceipt | null> {
  const db = createAdminServer()

  const items: ReceiptItem[] = [{
    name: `Подписка Orbo — тариф «${params.planName}»`.slice(0, 128),
    amount: params.amount,
    quantity: 1,
    vat_rate: 'none',
    vat_amount: 0,
    is_agent_item: false,
    payment_method_type: 'full_payment',
    payment_subject_type: 'service',
  }]

  const { data, error } = await db
    .from('fiscal_receipts')
    .insert({
      org_id: params.orgId,
      receipt_type: 'income',
      status: 'created',
      total_amount: params.amount,
      currency: 'RUB',
      items: JSON.stringify(items),
      payment_method: params.paymentMethod || 'electronic',
      customer_email: params.customerEmail || null,
      customer_phone: params.customerPhone || null,
      metadata: JSON.stringify({ payment_for: 'subscription', ...params.metadata }),
    })
    .select('*')
    .single()

  if (error) {
    logger.error({ error: error.message, org_id: params.orgId }, 'Failed to create subscription receipt')
    return null
  }

  logger.info({ receipt_id: data.id, org_id: params.orgId, plan: params.planName }, 'Subscription receipt created')
  return parseReceipt(data)
}

// ─── OrangeData Integration ─────────────────────────────────────────

/**
 * Маппинг FiscalReceipt → OrangeData API документ.
 */
export function mapToOrangeData(receipt: FiscalReceipt): OrangeDataDocument {
  const items: ReceiptItem[] = typeof receipt.items === 'string'
    ? JSON.parse(receipt.items)
    : receipt.items

  const positions: OrangeDataPosition[] = items.map(item => {
    const pos: OrangeDataPosition = {
      text: item.name,
      quantity: item.quantity,
      price: Math.round(item.amount * 100) / 100,
      tax: VAT_MAP[item.vat_rate] || 6,
      paymentMethodType: PAYMENT_METHOD_MAP[item.payment_method_type] || 4,
      paymentSubjectType: PAYMENT_SUBJECT_MAP[item.payment_subject_type] || 4,
    }

    if (item.is_agent_item) {
      pos.agentType = 64 // иной агент
      if (item.supplier_inn) pos.supplierINN = item.supplier_inn
      if (item.supplier_name || item.supplier_phone) {
        pos.supplierInfo = {}
        if (item.supplier_name) pos.supplierInfo.name = item.supplier_name
        if (item.supplier_phone) pos.supplierInfo.phoneNumbers = [item.supplier_phone]
      }
    }

    return pos
  })

  const totalAmount = items.reduce((sum, i) => sum + i.amount * i.quantity, 0)
  const paymentType = PAYMENT_TYPE_MAP[receipt.payment_method || 'electronic'] || 2

  // OrangeData receipt type: 1=income, 2=income_return
  const type = receipt.receipt_type === 'income_return' ? 2 : 1

  // customerContact — обязательное поле, email или телефон
  const customerContact = receipt.customer_email || receipt.customer_phone || 'none@orbo.ru'

  return {
    id: receipt.id,
    inn: getInn() || ORBO_INN,
    group: 'Main',
    content: {
      ffdVersion: 4, // FFD 1.2
      type,
      customerContact,
      positions,
      checkClose: {
        payments: [{ type: paymentType, amount: Math.round(totalAmount * 100) / 100 }],
        taxationSystem: TAXATION_SYSTEM,
      },
    },
  }
}

/**
 * Отправить чек в OrangeData.
 * Обновляет статус в БД: created → pending (при успехе) или оставляет created (при ошибке).
 */
export async function sendReceiptToOrangeData(receipt: FiscalReceipt): Promise<boolean> {
  if (!isOrangeDataConfigured()) {
    logger.debug({ receipt_id: receipt.id }, 'OrangeData not configured, receipt stays in created status')
    return false
  }

  const db = createAdminServer()
  const doc = mapToOrangeData(receipt)

  const result = await createDocument(doc)

  if (result.success) {
    await db
      .from('fiscal_receipts')
      .update({
        status: 'pending',
        ofd_provider: 'orangedata',
        updated_at: new Date().toISOString(),
      })
      .eq('id', receipt.id)

    logger.info({ receipt_id: receipt.id }, 'Receipt sent to OrangeData, status: pending')
    return true
  }

  // Increment retry count, save error
  await db
    .from('fiscal_receipts')
    .update({
      retry_count: (receipt.retry_count || 0) + 1,
      error_message: result.error || 'Unknown error',
      updated_at: new Date().toISOString(),
    })
    .eq('id', receipt.id)

  return false
}

/**
 * Проверить статус чека в OrangeData и обновить запись.
 */
export async function checkReceiptStatusFromOrangeData(receipt: FiscalReceipt): Promise<boolean> {
  if (!isOrangeDataConfigured()) return false

  const status = await getDocumentStatus(receipt.id)

  const db = createAdminServer()

  if (status.success) {
    await db
      .from('fiscal_receipts')
      .update({
        status: 'succeeded',
        fiscal_document_number: status.fiscalDocumentNumber || null,
        fiscal_sign: status.fiscalSign || null,
        fiscal_receipt_number: status.receiptNumber || null,
        shift_number: status.shiftNumber || null,
        fn_number: status.fnNumber || null,
        kkt_reg_number: status.kktRegNumber || null,
        ofd_receipt_url: status.ofdReceiptUrl || null,
        ofd_response: status.rawResponse || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', receipt.id)

    logger.info({
      receipt_id: receipt.id,
      fd: status.fiscalDocumentNumber,
      fp: status.fiscalSign,
    }, 'Receipt fiscalized successfully')
    return true
  }

  if (status.error === 'still_processing') {
    return false // still waiting
  }

  // Failed
  await db
    .from('fiscal_receipts')
    .update({
      status: 'failed',
      error_message: status.error || 'OrangeData processing failed',
      ofd_response: status.rawResponse || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', receipt.id)

  logger.error({ receipt_id: receipt.id, error: status.error }, 'Receipt fiscalization failed')
  return false
}

// ─── Batch Processing (for cron) ────────────────────────────────────

/**
 * Отправить все чеки в статусе 'created' (retry).
 */
export async function processPendingReceipts(): Promise<{ sent: number; errors: number }> {
  const db = createAdminServer()
  const MAX_RETRIES = 5

  const { data: receipts } = await db
    .from('fiscal_receipts')
    .select('*')
    .eq('status', 'created')
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })
    .limit(50)

  if (!receipts || receipts.length === 0) return { sent: 0, errors: 0 }

  let sent = 0
  let errors = 0

  for (const row of receipts) {
    const receipt = parseReceipt(row)
    const ok = await sendReceiptToOrangeData(receipt)
    if (ok) sent++
    else errors++
  }

  logger.info({ sent, errors, total: receipts.length }, 'Batch send receipts completed')
  return { sent, errors }
}

/**
 * Проверить статус чеков в статусе 'pending'.
 */
export async function pollPendingStatuses(): Promise<{ checked: number; succeeded: number; failed: number }> {
  const db = createAdminServer()

  const { data: receipts } = await db
    .from('fiscal_receipts')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)

  if (!receipts || receipts.length === 0) return { checked: 0, succeeded: 0, failed: 0 }

  let succeeded = 0
  let failed = 0

  for (const row of receipts) {
    const receipt = parseReceipt(row)
    const ok = await checkReceiptStatusFromOrangeData(receipt)
    if (ok) succeeded++
    // Note: 'still_processing' doesn't count as failed
    if (receipt.status === 'failed') failed++
  }

  logger.info({ checked: receipts.length, succeeded, failed }, 'Batch poll receipt statuses completed')
  return { checked: receipts.length, succeeded, failed }
}

// ─── Helpers ────────────────────────────────────────────────────────

export async function getReceiptsBySession(sessionId: string): Promise<FiscalReceipt[]> {
  const db = createAdminServer()
  const { data } = await db
    .from('fiscal_receipts')
    .select('*')
    .eq('payment_session_id', sessionId)
    .order('created_at', { ascending: false })

  return (data || []).map(parseReceipt)
}

function parseReceipt(row: any): FiscalReceipt {
  return {
    ...row,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || null),
    total_amount: parseFloat(row.total_amount) || 0,
    retry_count: parseInt(row.retry_count) || 0,
  }
}
