/**
 * Service Fee Report (ОРП) Service
 *
 * Формирует «Отчёт о розничных продажах» (ОРП-NNN) — сводный документ ООО Орбо
 * о выручке платформы за сервисный сбор с физлиц-участников за период.
 *
 * Особенности:
 * - Покупатель — обезличенная «розница» (в CommerceML: Роль=Покупатель,
 *   Наименование=Розничные покупатели). Соответствует бланку «Отчёт о розничных
 *   продажах» (форма КМ-6 / Эльба importer).
 * - Документ не привязан к конкретной организации платформы (org_id = NULL).
 *   Один документ покрывает все service_fee за период по всей платформе.
 * - В позиции выводятся строки по мероприятиям (сгруппированы), суммарно —
 *   платежи формата { session_id, amount, created_at, registration_id }
 *   хранятся в metadata для сверки в Эльбе.
 * - Нумерация: ОРП-{seq}, sequence service_fee_report_seq (миграция 280).
 * - Период произвольный: оператор сам выбирает from/to в суперадминке.
 *   Сервис помогает подсказкой default-периода через getLastReportPeriodEnd().
 * - Источник данных — platform_income.income_type = 'service_fee'.
 *   Возвраты сервисного сбора (service_fee_refund) в этот отчёт не входят —
 *   по бизнес-правилу service_fee у платформы не возвращается; в будущем,
 *   если политика изменится, будет отдельный «ОРП возврата».
 * - Юрлики-участники (agent_commission) — НЕ в этом отчёте. По ним выставляется
 *   УПД от юрлика-участника (доработка позже).
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { ORBO_ENTITY, orboSupplierSnapshot } from '@/lib/config/orbo-entity'
import {
  buildServiceFeeReportHtml,
  type ServiceFeeReportEventLine,
} from '@/lib/templates/accounting/service-fee-report-html'

const logger = createServiceLogger('ServiceFeeReportService')

// ─── Constants ──────────────────────────────────────────────────────

/**
 * Фиксированный «розничный» покупатель. Используется как маркер в customer_requisites,
 * а также в CommerceML-выгрузке (Контрагент → Роль=Покупатель → Наименование=Розничные покупатели).
 */
export const RETAIL_CUSTOMER_SNAPSHOT = {
  name: 'Розничные покупатели',
  customer_type: 'individual' as const,
  inn: null,
  kpp: null,
  ogrn: null,
  legal_address: null,
  email: null,
  phone: null,
  is_retail: true,
}

// ─── Types ──────────────────────────────────────────────────────────

export interface ServiceFeePaymentDetail {
  income_id: string
  payment_session_id: string | null
  event_registration_id: string | null
  amount: number
  created_at: string
  event_id: string | null
  event_title: string | null
  org_id: string
  org_name: string | null
}

export interface ServiceFeeReportPreview {
  periodStart: string
  periodEnd: string
  totalAmount: number
  paymentsCount: number
  eventsCount: number
  eventLines: ServiceFeeReportEventLine[]
  payments: ServiceFeePaymentDetail[]
}

export interface ServiceFeeReportGenerateResult {
  documentId: string
  docNumber: string
  docDate: string
  htmlUrl: string | null
  totalAmount: number
  paymentsCount: number
  eventsCount: number
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

async function generateReportNumber(): Promise<string> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `SELECT next_service_fee_report_number() AS number`,
    []
  )
  if (error) throw new Error(`Failed to generate ОРП number: ${error.message}`)
  return data?.[0]?.number || 'ОРП-1'
}

async function loadPayments(
  periodStart: string,
  periodEnd: string
): Promise<ServiceFeePaymentDetail[]> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `SELECT
       pi.id AS income_id,
       pi.payment_session_id,
       pi.event_registration_id,
       pi.amount::numeric AS amount,
       pi.created_at,
       er.event_id,
       e.title AS event_title,
       pi.org_id,
       o.name AS org_name
     FROM platform_income pi
     LEFT JOIN event_registrations er ON er.id = pi.event_registration_id
     LEFT JOIN events e ON e.id = er.event_id
     LEFT JOIN organizations o ON o.id = pi.org_id
     WHERE pi.income_type = 'service_fee'
       AND pi.created_at >= $1::date
       AND pi.created_at < ($2::date + INTERVAL '1 day')
     ORDER BY pi.created_at ASC`,
    [periodStart, periodEnd]
  )
  if (error) throw new Error(`Failed to load service fee payments: ${error.message}`)
  return (data || []).map((r: any) => ({
    income_id: r.income_id,
    payment_session_id: r.payment_session_id,
    event_registration_id: r.event_registration_id,
    amount: parseFloat(r.amount),
    created_at: r.created_at,
    event_id: r.event_id,
    event_title: r.event_title,
    org_id: r.org_id,
    org_name: r.org_name,
  }))
}

function groupPaymentsByEvent(
  payments: ServiceFeePaymentDetail[]
): ServiceFeeReportEventLine[] {
  const map = new Map<string, ServiceFeeReportEventLine>()

  for (const p of payments) {
    // Для оплат без event_id (теоретически — например, старые membership-оплаты)
    // используем синтетический ключ "no_event".
    const key = p.event_id || 'no_event'
    const title =
      p.event_title ||
      (p.event_id
        ? `Мероприятие ${p.event_id.slice(0, 8)}`
        : 'Прочие платежи (без мероприятия)')

    const existing = map.get(key)
    if (existing) {
      existing.paymentsCount += 1
      existing.totalAmount = Math.round((existing.totalAmount + p.amount) * 100) / 100
      existing.paymentIds.push(p.income_id)
    } else {
      map.set(key, {
        eventId: p.event_id,
        eventTitle: title,
        orgName: p.org_name,
        paymentsCount: 1,
        totalAmount: p.amount,
        paymentIds: [p.income_id],
      })
    }
  }

  // Сортируем по убыванию суммы для читаемости
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount)
}

function buildLines(eventLines: ServiceFeeReportEventLine[]) {
  return eventLines.map((line) => ({
    name: `Сервисный сбор за продажу билетов на мероприятие «${line.eventTitle}»${line.paymentsCount > 1 ? ` (${line.paymentsCount} шт.)` : ''}`,
    unit: 'усл. ед.',
    unit_code: '796',
    quantity: 1,
    price: line.totalAmount,
    sum: line.totalAmount,
    vat_rate: 'Без НДС',
    // Доп. поля для CommerceML / Эльбы (не обязательные по схеме accounting_documents)
    event_id: line.eventId,
    event_title: line.eventTitle,
    payments_count: line.paymentsCount,
  }))
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Дата period_end последнего сформированного ОРП. Используется как подсказка
 * для выбора начала периода следующего отчёта (по умолчанию — следующий день).
 */
export async function getLastReportPeriodEnd(): Promise<string | null> {
  const db = createAdminServer()
  const { data, error } = await db
    .from('accounting_documents')
    .select('period_end')
    .eq('doc_type', 'service_fee_report')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    logger.error({ error: error.message }, 'Failed to get last ОРП period_end')
    return null
  }
  return data?.period_end || null
}

/**
 * Предпросмотр ОРП за период. Ничего не сохраняет.
 */
export async function previewServiceFeeReport(
  periodStart: string,
  periodEnd: string
): Promise<ServiceFeeReportPreview> {
  const payments = await loadPayments(periodStart, periodEnd)
  const eventLines = groupPaymentsByEvent(payments)
  const totalAmount =
    Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100

  return {
    periodStart,
    periodEnd,
    totalAmount,
    paymentsCount: payments.length,
    eventsCount: eventLines.length,
    eventLines,
    payments,
  }
}

/**
 * Сформировать и сохранить ОРП за указанный период. Создаёт запись в
 * accounting_documents и HTML-файл в S3. Возвращает идентификаторы.
 * Если за период нет ни одного service_fee — бросает ошибку (не создаём пустой документ).
 */
export async function generateServiceFeeReport(
  periodStart: string,
  periodEnd: string
): Promise<ServiceFeeReportGenerateResult> {
  const db = createAdminServer()
  const preview = await previewServiceFeeReport(periodStart, periodEnd)

  if (preview.paymentsCount === 0 || preview.totalAmount <= 0) {
    throw new Error(
      `За период ${periodStart} — ${periodEnd} нет сервисных сборов. Документ не сформирован.`
    )
  }

  const docNumber = await generateReportNumber()
  const docDate = periodEnd // отчёт датируется последним днём периода

  // 1. Собрать HTML
  const html = buildServiceFeeReportHtml({
    docNumber,
    docDate,
    periodStart,
    periodEnd,
    eventLines: preview.eventLines,
    totalAmount: preview.totalAmount,
    paymentsCount: preview.paymentsCount,
  })

  // 2. Загрузить HTML в S3
  const { createStorage, getBucket, getStoragePath } = await import('@/lib/storage')
  const storage = createStorage()
  const bucket = getBucket('documents')
  const filename = docNumber.replace(/[^a-zA-Zа-яА-ЯёЁ0-9-]/g, '_')
  const localPath = `service-fee-reports/${filename}.html`
  const storagePath = getStoragePath('documents', localPath)

  await storage.upload(bucket, storagePath, Buffer.from(html, 'utf-8'), {
    contentType: 'text/html; charset=utf-8',
  })
  const htmlUrl = storage.getPublicUrl(bucket, storagePath)

  // 3. Записать документ
  const lines = buildLines(preview.eventLines)

  const metadata = {
    payments_count: preview.paymentsCount,
    events_count: preview.eventsCount,
    // Детализация по каждой оплате — для сверки в Эльбе и аудита
    payments: preview.payments.map((p) => ({
      income_id: p.income_id,
      payment_session_id: p.payment_session_id,
      event_registration_id: p.event_registration_id,
      event_id: p.event_id,
      event_title: p.event_title,
      org_id: p.org_id,
      org_name: p.org_name,
      amount: p.amount,
      created_at: p.created_at,
    })),
  }

  const { data: docRow, error: docErr } = await db
    .from('accounting_documents')
    .insert({
      doc_type: 'service_fee_report',
      doc_number: docNumber,
      doc_date: docDate,
      period_start: periodStart,
      period_end: periodEnd,
      org_id: null, // ОРП без привязки к конкретной организации
      supplier_requisites: orboSupplierSnapshot(),
      customer_requisites: RETAIL_CUSTOMER_SNAPSHOT,
      customer_type: 'individual',
      lines: JSON.stringify(lines),
      total_amount: preview.totalAmount,
      currency: 'RUB',
      html_url: htmlUrl,
      status: 'generated',
      metadata,
    })
    .select('id, doc_number, doc_date, html_url')
    .single()

  if (docErr || !docRow) {
    logger.error(
      { period_start: periodStart, period_end: periodEnd, error: docErr?.message },
      'Failed to insert service fee report'
    )
    throw new Error(`Failed to create service fee report: ${docErr?.message}`)
  }

  logger.info(
    {
      doc_number: docNumber,
      period_start: periodStart,
      period_end: periodEnd,
      total_amount: preview.totalAmount,
      payments_count: preview.paymentsCount,
      events_count: preview.eventsCount,
      supplier: ORBO_ENTITY.shortName,
    },
    'Service fee report (ОРП) generated'
  )

  return {
    documentId: docRow.id,
    docNumber,
    docDate,
    htmlUrl,
    totalAmount: preview.totalAmount,
    paymentsCount: preview.paymentsCount,
    eventsCount: preview.eventsCount,
  }
}
