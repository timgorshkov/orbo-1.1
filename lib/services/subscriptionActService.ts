/**
 * Subscription Licensing Act Service
 *
 * Формирует акт передачи неисключительных прав на ПО Orbo (АЛ-NNN) при оплате
 * тарифа юридическим лицом, ИП или самозанятым. Для физлиц акт не формируется —
 * им достаточно фискального чека (согласовано с пользователем, 2026-04-15).
 *
 * Ключевые правила:
 * - Акт датирован датой НАЧАЛА периода (ст. 1235, 1286 ГК РФ)
 * - Номер АЛ-{seq}, начиная с 1001 (sequence billing_act_seq)
 * - Хранится структурно в accounting_documents (снэпшот реквизитов обеих сторон)
 *   + рендер HTML в S3 bucket 'documents'
 * - org_invoices.act_number / act_document_url / accounting_document_id заполняются
 *   для обратной совместимости со старыми списками
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { getContractByOrgId } from './contractService'
import { ORBO_ENTITY, orboSupplierSnapshot } from '@/lib/config/orbo-entity'
import {
  buildSubscriptionActHtml,
  type SubscriptionActTemplateData,
} from '@/lib/templates/accounting/subscription-act-html'

const logger = createServiceLogger('SubscriptionActService')

// ─── Types ──────────────────────────────────────────────────────────

type CustomerType = 'individual' | 'legal_entity' | 'self_employed'

interface CustomerSnapshot {
  type: CustomerType
  name: string
  inn: string | null
  email: string | null
  phone: string | null
  legalAddress: string | null
}

export interface SubscriptionActResult {
  /** null, если акт не формировался (физлицо или дубликат без изменений) */
  documentId: string | null
  actNumber: string | null
  htmlUrl: string | null
  skipped?: 'individual_customer'
}

// ─── Act number ─────────────────────────────────────────────────────

async function generateActNumber(): Promise<string> {
  const db = createAdminServer()
  const { data, error } = await db.raw(`SELECT next_billing_act_number() as number`, [])
  if (error) throw new Error(`Failed to generate act number: ${error.message}`)
  return data?.[0]?.number || 'АЛ-1001'
}

// ─── Resolve customer ────────────────────────────────────────────────

async function resolveCustomer(
  invoice: any
): Promise<CustomerSnapshot> {
  // Приоритет: реквизиты из верифицированного контракта → поля инвойса
  const contract = await getContractByOrgId(invoice.org_id).catch(() => null)
  const cp = (contract as any)?.counterparty

  if (cp) {
    return {
      type: (cp.type as CustomerType) || 'individual',
      name: cp.type === 'legal_entity' ? (cp.org_name || cp.full_name) : (cp.full_name || ''),
      inn: cp.inn || null,
      email: invoice.customer_email || cp.email || null,
      phone: cp.phone || invoice.customer_phone || null,
      legalAddress: cp.legal_address || null,
    }
  }

  return {
    type: (invoice.customer_type as CustomerType) || 'individual',
    name: invoice.customer_name || invoice.org_name || '—',
    inn: invoice.customer_inn || null,
    email: invoice.customer_email || null,
    phone: invoice.customer_phone || null,
    legalAddress: null,
  }
}

function customerRequisitesSnapshot(c: CustomerSnapshot) {
  return {
    name: c.name,
    customer_type: c.type,
    inn: c.inn,
    legal_address: c.legalAddress,
    email: c.email,
    phone: c.phone,
  }
}

// ─── Main entry point ──────────────────────────────────────────────

/**
 * Генерирует акт для инвойса, если покупатель — не физлицо.
 * Для физлиц возвращает { skipped: 'individual_customer' } без создания документа.
 * Идемпотентно: повторный вызов для того же инвойса отдаёт существующий документ.
 */
export async function generateSubscriptionAct(
  invoiceId: string
): Promise<SubscriptionActResult> {
  const db = createAdminServer()

  // 1. Загрузить инвойс со связанными данными
  const { data: invoiceRows } = await db.raw(
    `
    SELECT
      i.id, i.org_id, i.amount, i.period_start, i.period_end, i.paid_at,
      i.payment_method, i.gateway_code, i.customer_type, i.customer_name,
      i.customer_inn, i.customer_email, i.customer_phone,
      i.act_number, i.act_document_url, i.accounting_document_id,
      s.plan_code,
      o.name as org_name,
      bp.name as plan_name
    FROM org_invoices i
    LEFT JOIN org_subscriptions s ON s.id = i.subscription_id
    LEFT JOIN organizations o ON o.id = i.org_id
    LEFT JOIN billing_plans bp ON bp.code = s.plan_code
    WHERE i.id = $1
  `,
    [invoiceId]
  )

  const invoice = invoiceRows?.[0]
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)

  // 2. Идемпотентность: если уже есть связанный accounting_document — вернуть его
  if (invoice.accounting_document_id) {
    const { data: existing } = await db
      .from('accounting_documents')
      .select('id, doc_number, html_url')
      .eq('id', invoice.accounting_document_id)
      .maybeSingle()
    if (existing) {
      return {
        documentId: existing.id,
        actNumber: existing.doc_number,
        htmlUrl: existing.html_url,
      }
    }
  }

  // Fallback идемпотентность для старых записей (до миграции 279): если заполнены
  // act_number/act_document_url в инвойсе, но нет accounting_document_id — не трогаем,
  // возвращаем старый URL (миграция истории — отдельная задача).
  if (invoice.act_document_url && invoice.act_number) {
    return {
      documentId: null,
      actNumber: invoice.act_number,
      htmlUrl: invoice.act_document_url,
    }
  }

  // 3. Определить реквизиты покупателя
  const customer = await resolveCustomer(invoice)

  // 4. SKIP для физлиц (ст. 493 ГК РФ: чек подтверждает сделку для физлица)
  if (customer.type === 'individual') {
    logger.info(
      { invoice_id: invoiceId, org_id: invoice.org_id },
      'Subscription act skipped: individual customer (fiscal receipt is sufficient)'
    )
    return {
      documentId: null,
      actNumber: null,
      htmlUrl: null,
      skipped: 'individual_customer',
    }
  }

  // 5. Подготовить данные акта
  const planName = invoice.plan_name || invoice.plan_code || 'Orbo'
  const amount = parseFloat(invoice.amount) || 0
  const actNumber = invoice.act_number || (await generateActNumber())

  const templateData: SubscriptionActTemplateData = {
    actNumber,
    invoiceId: invoice.id,
    orgName: invoice.org_name || '—',
    planName,
    amount,
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    customer,
  }

  // 6. Собрать HTML
  const html = buildSubscriptionActHtml(templateData)

  // 7. Загрузить в S3
  const { createStorage, getBucket, getStoragePath } = await import('@/lib/storage')
  const storage = createStorage()
  const bucket = getBucket('documents')
  const filename = actNumber.replace(/[^a-zA-Zа-яА-ЯёЁ0-9-]/g, '_')
  const localPath = `subscription-acts/${invoice.org_id}/${filename}.html`
  const storagePath = getStoragePath('documents', localPath)

  await storage.upload(bucket, storagePath, Buffer.from(html, 'utf-8'), {
    contentType: 'text/html; charset=utf-8',
  })

  const htmlUrl = storage.getPublicUrl(bucket, storagePath)

  // 8. Записать структурированный документ в accounting_documents
  const contract = await getContractByOrgId(invoice.org_id).catch(() => null)
  const contractId = (contract as any)?.id || null

  const lines = [
    {
      name: `Передача неисключительных прав на использование программы для ЭВМ «Orbo», тариф «${planName}»`,
      unit: 'усл. ед.',
      unit_code: '796',
      quantity: 1,
      price: amount,
      sum: amount,
      vat_rate: 'Без НДС',
    },
  ]

  const { data: docRow, error: docErr } = await db
    .from('accounting_documents')
    .insert({
      doc_type: 'subscription_act',
      doc_number: actNumber,
      doc_date: invoice.period_start, // дата акта = первый день периода
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      org_id: invoice.org_id,
      org_invoice_id: invoice.id,
      contract_id: contractId,
      supplier_requisites: orboSupplierSnapshot(),
      customer_requisites: customerRequisitesSnapshot(customer),
      customer_type: customer.type,
      lines: JSON.stringify(lines),
      total_amount: amount,
      currency: 'RUB',
      html_url: htmlUrl,
      status: 'generated',
      metadata: {
        plan_code: invoice.plan_code,
        plan_name: planName,
        payment_method: invoice.payment_method || invoice.gateway_code || null,
        paid_at: invoice.paid_at,
      },
    })
    .select('id, doc_number, html_url')
    .single()

  if (docErr || !docRow) {
    logger.error(
      { invoice_id: invoiceId, error: docErr?.message },
      'Failed to insert accounting_document row'
    )
    throw new Error(`Failed to create accounting_document: ${docErr?.message}`)
  }

  // 9. Обновить инвойс (и новую связь, и старые поля для обратной совместимости)
  await db
    .from('org_invoices')
    .update({
      act_number: actNumber,
      act_document_url: htmlUrl,
      act_generated_at: new Date().toISOString(),
      accounting_document_id: docRow.id,
    })
    .eq('id', invoiceId)

  logger.info(
    {
      invoice_id: invoiceId,
      org_id: invoice.org_id,
      accounting_document_id: docRow.id,
      act_number: actNumber,
      url: htmlUrl,
      customer_type: customer.type,
      supplier: ORBO_ENTITY.shortName,
    },
    'Subscription act generated'
  )

  return {
    documentId: docRow.id,
    actNumber,
    htmlUrl,
  }
}
