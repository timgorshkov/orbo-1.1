/**
 * Fiscal Receipt Service
 *
 * Формирование фискальных чеков (54-ФЗ) при оплате билетов.
 * На текущем этапе чеки формируются и сохраняются в БД, но не отправляются в ОФД.
 *
 * Каждый чек содержит две позиции:
 * 1. «Услуга участия» — с агентскими тегами (поставщик = организатор)
 * 2. «Сервисный сбор Orbo» — собственная реализация ОРБО
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('FiscalReceiptService')

// ─── Types ──────────────────────────────────────────────────────────

export interface ReceiptItem {
  /** Название позиции */
  name: string
  /** Сумма (в рублях) */
  amount: number
  /** Количество */
  quantity: number
  /** Ставка НДС: 'none' | '5' | '7' | '10' | '22' */
  vat_rate: string
  /** Сумма НДС */
  vat_amount: number
  /** Является ли позиция агентской (есть поставщик) */
  is_agent_item: boolean
  /** Наименование поставщика (для агентских позиций) */
  supplier_name?: string
  /** ИНН поставщика (тег 1226) */
  supplier_inn?: string
  /** Телефон поставщика */
  supplier_phone?: string
  /** Способ расчёта (тег 1214): full_payment | advance | full_prepayment */
  payment_method_type: string
  /** Признак предмета расчёта (тег 1212): service | commodity | payment */
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
  created_at: string
}

// ─── ОРБО company data ─────────────────────────────────────────────

const ORBO_COMPANY = {
  name: 'ООО «ОРБО»',
  inn: '9701327025',
  kpp: '770101001',
  ogrn: '1267700119037',
  taxSystem: 'usn_income', // УСН доходы
}

// ─── Create Receipt ────────────────────────────────────────────────

/**
 * Создаёт фискальный чек при оплате билета.
 * Чек сохраняется в статусе 'created' — отправка в ОФД будет реализована позже.
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

  // Позиция 1: Билет / Услуга участия (агентская)
  if (params.ticketPrice > 0) {
    items.push({
      name: `Услуга участия — «${params.eventName}»`,
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

  // Позиция 2: Сервисный сбор Orbo (собственная реализация)
  if (params.serviceFeeAmount > 0) {
    items.push({
      name: 'Сервисный сбор Orbo',
      amount: params.serviceFeeAmount,
      quantity: 1,
      vat_rate: 'none', // УСН
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
    })
    .select('*')
    .single()

  if (error) {
    logger.error({ error: error.message, session_id: params.paymentSessionId }, 'Failed to create fiscal receipt')
    return null
  }

  logger.info({
    receipt_id: data.id,
    session_id: params.paymentSessionId,
    total: params.totalAmount,
    items_count: items.length,
  }, 'Fiscal receipt created')

  return data as FiscalReceipt
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
      name: `Возврат — «${params.eventName}»`,
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

  const { data, error } = await db
    .from('fiscal_receipts')
    .insert({
      org_id: params.orgId,
      receipt_type: 'income_return',
      status: 'created',
      total_amount: params.refundAmount,
      currency: 'RUB',
      items: JSON.stringify(items),
      payment_method: 'electronic',
      customer_email: params.customerEmail || null,
      customer_phone: params.customerPhone || null,
      original_receipt_id: params.originalReceiptId,
    })
    .select('*')
    .single()

  if (error) {
    logger.error({ error: error.message }, 'Failed to create refund receipt')
    return null
  }

  logger.info({ receipt_id: data.id, original_id: params.originalReceiptId }, 'Refund receipt created')
  return data as FiscalReceipt
}

/**
 * Получает чеки по платёжной сессии.
 */
export async function getReceiptsBySession(sessionId: string): Promise<FiscalReceipt[]> {
  const db = createAdminServer()
  const { data } = await db
    .from('fiscal_receipts')
    .select('*')
    .eq('payment_session_id', sessionId)
    .order('created_at', { ascending: false })

  return (data || []) as FiscalReceipt[]
}
