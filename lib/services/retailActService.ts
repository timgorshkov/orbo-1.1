/**
 * Retail Act (АУ) Service
 *
 * Формирует «Акт об оказании услуг» (АУ-NNN) на сводное физлицо
 * «Розничные покупатели» — выручка платформы от сервисного сбора с физлиц-участников
 * за период. Отправляет акт в Контур.Эльба через публичное API.
 *
 * Особенности:
 * - Заказчик — обезличенная «розница» (контрагент «Розничные покупатели» в Эльбе).
 * - Документ не привязан к конкретной организации платформы (org_id = NULL): один
 *   акт покрывает все service_fee по всей платформе за период.
 * - В позициях — строки по мероприятиям (сгруппированы). Полная построчная
 *   расшифровка по каждой оплате хранится в metadata.payments, реестр формируется
 *   на лету при скачивании архива.
 * - Нумерация: АУ-{seq}, sequence retail_act_seq (миграция 281).
 * - Источник данных — platform_income.income_type = 'service_fee'.
 * - Возвраты service_fee в акт не входят — по бизнес-правилу service_fee у платформы
 *   не возвращается.
 * - Юрлики-участники (agent_commission) — НЕ в этом акте.
 *
 * Валидации:
 * - periodStart <= periodEnd
 * - periodEnd <= сегодня
 * - Если уже есть АУ — periodStart = last.period_end + 1 (нельзя задним числом/с разрывом)
 * - За период должны быть платежи.
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { ORBO_ENTITY, orboSupplierSnapshot } from '@/lib/config/orbo-entity'
import {
  buildRetailActHtml,
  type RetailActLine,
} from '@/lib/templates/accounting/retail-act-html'
import {
  buildRetailActRegistryHtml,
  type RetailActRegistryPayment,
} from '@/lib/templates/accounting/retail-act-registry-html'
import {
  submitActToElba,
  resolveOrganizationId,
  ensureRetailContractorId,
  ElbaApiError,
  type ElbaActItem,
} from '@/lib/services/elbaApiClient'

const logger = createServiceLogger('RetailActService')

// ─── Constants ──────────────────────────────────────────────────────

/**
 * Фиксированный «розничный» покупатель: маркер в customer_requisites и привязка
 * к контрагенту в Эльбе. ИНН/КПП отсутствуют — физлица-участники по оферте.
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

export type RetailActFeeType = 'base' | 'full' | 'unknown'

export interface RetailActPaymentDetail {
  income_id: string
  payment_session_id: string | null
  event_registration_id: string | null
  amount: number
  created_at: string
  event_id: string | null
  event_title: string | null
  org_id: string
  org_name: string | null
  /** Ставка сервисного сбора на момент оплаты (0.05, 0.10 и т.п.). null для исторических записей без snapshot. */
  fee_rate: number | null
  /** Тип сбора по ставке: базовый (5%), полный (10%), unknown для редких случаев. */
  fee_type: RetailActFeeType
}

export interface RetailActPreview {
  periodStart: string
  periodEnd: string
  totalAmount: number
  paymentsCount: number
  eventsCount: number
  lines: RetailActLine[]
  payments: RetailActPaymentDetail[]
}

export interface RetailActGenerateResult {
  documentId: string
  docNumber: string
  docDate: string
  htmlUrl: string | null
  totalAmount: number
  paymentsCount: number
  eventsCount: number
  elbaSyncStatus: 'synced' | 'failed'
  elbaDocumentId: string | null
  elbaUrl: string | null
  elbaError: string | null
}

export interface RetailActDocument {
  id: string
  doc_number: string
  doc_date: string
  period_start: string
  period_end: string
  total_amount: number
  html_url: string | null
  metadata: {
    payments_count: number
    events_count: number
    payments: RetailActRegistryPayment[]
  }
  elba_document_id: string | null
  elba_url: string | null
  elba_sync_status: 'pending' | 'synced' | 'failed' | null
  elba_error: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────

async function generateActNumber(): Promise<string> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `SELECT next_retail_act_number() AS number`,
    []
  )
  if (error) throw new Error(`Failed to generate АУ number: ${error.message}`)
  return data?.[0]?.number || 'АУ-1'
}

async function loadPayments(
  periodStart: string,
  periodEnd: string
): Promise<RetailActPaymentDetail[]> {
  const db = createAdminServer()
  // Исключаем service_fee, по которым в БД уже есть запись service_fee_refund
  // (созданная webhook'ом полного возврата или вручную через record_service_fee_refund).
  // Сравниваем по payment_session_id; refund в более раннем периоде тоже учитываем —
  // если сторно прошло раньше, эту сделку нельзя включать в текущий акт.
  // Если сторно окажется ПОСЛЕ закрытия периода — это ручной кейс корректировки
  // прошлого АУ (отзыв документа в Эльбе + новый акт), webhook сам этим не занимается.
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
       o.name AS org_name,
       ps.service_fee_rate::numeric AS fee_rate
     FROM platform_income pi
     LEFT JOIN event_registrations er ON er.id = pi.event_registration_id
     LEFT JOIN events e ON e.id = er.event_id
     LEFT JOIN organizations o ON o.id = pi.org_id
     LEFT JOIN payment_sessions ps ON ps.id = pi.payment_session_id
     WHERE pi.income_type = 'service_fee'
       AND COALESCE((pi.metadata->>'is_test')::boolean, false) = false
       AND pi.created_at >= $1::date
       AND pi.created_at < ($2::date + INTERVAL '1 day')
       AND NOT EXISTS (
         SELECT 1 FROM platform_income r
         WHERE r.income_type = 'service_fee_refund'
           AND r.payment_session_id = pi.payment_session_id
           AND r.created_at < ($2::date + INTERVAL '1 day')
       )
     ORDER BY pi.created_at ASC`,
    [periodStart, periodEnd]
  )
  if (error) throw new Error(`Failed to load service fee payments: ${error.message}`)
  return (data || []).map((r: any) => {
    const rate = r.fee_rate != null ? parseFloat(r.fee_rate) : null
    return {
      income_id: r.income_id,
      payment_session_id: r.payment_session_id,
      event_registration_id: r.event_registration_id,
      amount: parseFloat(r.amount),
      created_at: r.created_at,
      event_id: r.event_id,
      event_title: r.event_title,
      org_id: r.org_id,
      org_name: r.org_name,
      fee_rate: rate,
      fee_type: classifyFeeType(rate),
    }
  })
}

/**
 * Классификация сервисного сбора по ставке-снэпшоту в payment_sessions.
 * 0.05 (5%) → базовый (юрлица/ИП-организаторы, с них же удерживается агентское).
 * 0.10 (10%) → полный (физлица-организаторы, без агентского вознаграждения).
 * Все остальные значения и null — помечаем как unknown.
 */
function classifyFeeType(rate: number | null): RetailActFeeType {
  if (rate == null || isNaN(rate)) return 'unknown'
  if (Math.abs(rate - 0.05) < 1e-6) return 'base'
  if (Math.abs(rate - 0.1) < 1e-6) return 'full'
  return 'unknown'
}

function feeTypeLabel(feeType: RetailActFeeType): string {
  if (feeType === 'base') return 'базовый (5%)'
  if (feeType === 'full') return 'полный (10%)'
  return ''
}

function groupPaymentsByEvent(payments: RetailActPaymentDetail[]): RetailActLine[] {
  const map = new Map<string, RetailActLine>()

  for (const p of payments) {
    // Группируем по event_id + fee_type + amount (в копейках).
    // Зачем amount: на одном событии могут быть платежи с разной суммой сбора —
    // например, часть участников по полной цене, часть со скидкой. Эльба
    // по позиции акта показывает Цену = Сумма / Кол-во, и при усреднении эта
    // цена не совпадает ни с одной реальной транзакцией. С учётом amount в ключе
    // каждая уникальная цена попадает в свою строку акта (qty=N, price=amount).
    const amountCents = Math.round(p.amount * 100)
    const key = `${p.event_id || 'no_event'}__${p.fee_type}__${amountCents}`
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
        feeType: p.fee_type,
        pricePerPayment: p.amount,
      })
    }
  }

  // Сортируем: сначала по сумме строки (вклад в выручку), потом по убыванию цены.
  return Array.from(map.values()).sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount
    return b.pricePerPayment - a.pricePerPayment
  })
}

function buildDbLines(lines: RetailActLine[]) {
  return lines.map((line) => {
    const feeLabel = feeTypeLabel(line.feeType)
    const namePrefix = feeLabel ? `Сервисный сбор ${feeLabel}` : 'Сервисный сбор'
    return {
      name: `${namePrefix} за информационное обслуживание при приобретении билетов на мероприятие «${line.eventTitle}»${line.paymentsCount > 1 ? ` (${line.paymentsCount} шт.)` : ''}`,
      unit: 'усл. ед.',
      unit_code: '796',
      // quantity = paymentsCount, price = pricePerPayment, sum = totalAmount —
      // тогда Эльба корректно отрисует столбец «Цена» (sum / quantity) и
      // строки по разным ценам не сольются в одну с усреднённой ценой.
      quantity: line.paymentsCount,
      price: line.pricePerPayment,
      sum: line.totalAmount,
      vat_rate: 'Без НДС',
      event_id: line.eventId,
      event_title: line.eventTitle,
      payments_count: line.paymentsCount,
      fee_type: line.feeType,
    }
  })
}

/**
 * Формирует позиции для отправки в Эльбу. Одна позиция = одна цена-сбор
 * по одному событию (см. groupPaymentsByEvent: ключ event_id + fee_type + amount).
 * quantity = число платежей этой цены, price = amount одного платежа,
 * sum = quantity × price автоматически считает Эльба.
 */
function buildElbaItems(lines: RetailActLine[]): ElbaActItem[] {
  return lines.map((line) => {
    const feeLabel = feeTypeLabel(line.feeType)
    const namePrefix = feeLabel ? `Сервисный сбор Orbo ${feeLabel}` : 'Сервисный сбор Orbo'
    return {
      productName: truncate(
        `${namePrefix}: «${line.eventTitle}»${line.orgName ? ` / ${line.orgName}` : ''}`,
        2000
      ),
      quantity: line.paymentsCount,
      unitName: 'шт.',
      price: round2(line.pricePerPayment),
      // Важно: Эльба требует ndsRate === null для акта с withNDS=false.
      // Иначе возвращает 400 «Для акта без НДС поле ActItemToCreate.NDSRate должно принимать значение null».
      ndsRate: null,
    }
  })
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Дата period_end последнего сформированного АУ. Используется как подсказка
 * и как основа для валидации «нельзя задним числом и с разрывом».
 */
export async function getLastActPeriodEnd(): Promise<string | null> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `SELECT to_char(period_end, 'YYYY-MM-DD') AS period_end
       FROM accounting_documents
      WHERE doc_type = 'retail_act'
      ORDER BY period_end DESC
      LIMIT 1`,
    []
  )
  if (error) {
    logger.error({ error: error.message }, 'Failed to get last retail act period_end')
    return null
  }
  return data?.[0]?.period_end || null
}

/**
 * Дата обязательного начала следующего акта: last.period_end + 1.
 * null, если актов ещё нет (первый документ — стартовая дата свободная).
 */
export async function getNextRequiredFrom(): Promise<string | null> {
  const lastEnd = await getLastActPeriodEnd()
  if (!lastEnd) return null
  const d = new Date(lastEnd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

export async function previewRetailAct(
  periodStart: string,
  periodEnd: string
): Promise<RetailActPreview> {
  const payments = await loadPayments(periodStart, periodEnd)
  const lines = groupPaymentsByEvent(payments)
  const totalAmount = round2(payments.reduce((s, p) => s + p.amount, 0))

  return {
    periodStart,
    periodEnd,
    totalAmount,
    paymentsCount: payments.length,
    eventsCount: lines.length,
    lines,
    payments,
  }
}

/**
 * Сформировать АУ за период: создать запись accounting_documents, загрузить HTML
 * в S3, отправить акт в Эльбу. Если отправка в Эльбу падает — акт всё равно
 * сохранён (elba_sync_status = 'failed'), можно повторить через resendActToElba.
 */
export async function generateRetailAct(
  periodStart: string,
  periodEnd: string
): Promise<RetailActGenerateResult> {
  const db = createAdminServer()

  // 1. Санитарная проверка диапазона
  if (periodStart > periodEnd) {
    throw new Error('Дата начала периода позже даты окончания.')
  }
  const todayISO = new Date().toISOString().split('T')[0]
  if (periodEnd > todayISO) {
    throw new Error(`Дата окончания (${periodEnd}) не может быть в будущем (сегодня ${todayISO}).`)
  }

  // 2. Нельзя задним числом и с разрывом
  const requiredFrom = await getNextRequiredFrom()
  if (requiredFrom && periodStart !== requiredFrom) {
    throw new Error(
      `Начало периода должно быть ${requiredFrom} (день, следующий за последним АУ). ` +
      `Получено ${periodStart}. Нельзя формировать акт задним числом или с разрывом.`
    )
  }

  // 3. Должны быть платежи
  const preview = await previewRetailAct(periodStart, periodEnd)
  if (preview.paymentsCount === 0 || preview.totalAmount <= 0) {
    throw new Error(
      `За период ${periodStart} — ${periodEnd} нет сервисных сборов. Акт не сформирован.`
    )
  }

  const docNumber = await generateActNumber()
  const docDate = periodEnd

  // 4. Сформировать HTML акта (без elbaUrl — на этом этапе ещё не отправили)
  const html = buildRetailActHtml({
    docNumber,
    docDate,
    periodStart,
    periodEnd,
    lines: preview.lines,
    totalAmount: preview.totalAmount,
    paymentsCount: preview.paymentsCount,
    elbaUrl: null,
  })

  // 5. Загрузить HTML в S3
  const { createStorage, getBucket, getStoragePath } = await import('@/lib/storage')
  const storage = createStorage()
  const bucket = getBucket('documents')
  const filename = docNumber.replace(/[^a-zA-Zа-яА-ЯёЁ0-9-]/g, '_')
  const localPath = `retail-acts/${filename}.html`
  const storagePath = getStoragePath('documents', localPath)
  await storage.upload(bucket, storagePath, Buffer.from(html, 'utf-8'), {
    contentType: 'text/html; charset=utf-8',
  })
  const htmlUrl = storage.getPublicUrl(bucket, storagePath)

  // 6. Вставить запись в accounting_documents
  const dbLines = buildDbLines(preview.lines)
  const metadata = {
    payments_count: preview.paymentsCount,
    events_count: preview.eventsCount,
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
      fee_rate: p.fee_rate,
      fee_type: p.fee_type,
    })),
  }

  const { data: docRow, error: docErr } = await db
    .from('accounting_documents')
    .insert({
      doc_type: 'retail_act',
      doc_number: docNumber,
      doc_date: docDate,
      period_start: periodStart,
      period_end: periodEnd,
      org_id: null,
      supplier_requisites: orboSupplierSnapshot(),
      customer_requisites: RETAIL_CUSTOMER_SNAPSHOT,
      customer_type: 'individual',
      lines: JSON.stringify(dbLines),
      total_amount: preview.totalAmount,
      currency: 'RUB',
      html_url: htmlUrl,
      status: 'generated',
      metadata,
      elba_sync_status: 'pending',
    })
    .select('id, doc_number, doc_date, html_url')
    .single()

  if (docErr || !docRow) {
    logger.error(
      { period_start: periodStart, period_end: periodEnd, error: docErr?.message },
      'Failed to insert retail act'
    )
    throw new Error(`Failed to create retail act: ${docErr?.message}`)
  }

  // 7. Отправить в Эльбу (ошибка не блокирует — статус failed, можно переотправить)
  const elbaResult = await sendActToElba({
    documentId: docRow.id,
    docNumber,
    docDate,
    items: buildElbaItems(preview.lines),
    comment: `Сервисный сбор Orbo за период ${periodStart} — ${periodEnd}. Плательщики — розничные покупатели (физлица-участники).`,
  })

  logger.info(
    {
      doc_number: docNumber,
      period_start: periodStart,
      period_end: periodEnd,
      total_amount: preview.totalAmount,
      payments_count: preview.paymentsCount,
      events_count: preview.eventsCount,
      supplier: ORBO_ENTITY.shortName,
      elba_sync_status: elbaResult.elbaSyncStatus,
    },
    'Retail act (АУ) generated'
  )

  return {
    documentId: docRow.id,
    docNumber,
    docDate,
    htmlUrl,
    totalAmount: preview.totalAmount,
    paymentsCount: preview.paymentsCount,
    eventsCount: preview.eventsCount,
    elbaSyncStatus: elbaResult.elbaSyncStatus,
    elbaDocumentId: elbaResult.elbaDocumentId,
    elbaUrl: elbaResult.elbaUrl,
    elbaError: elbaResult.elbaError,
  }
}

interface SendActToElbaInput {
  documentId: string
  docNumber: string
  docDate: string
  items: ElbaActItem[]
  comment?: string
}

interface SendActToElbaResult {
  elbaSyncStatus: 'synced' | 'failed'
  elbaDocumentId: string | null
  elbaUrl: string | null
  elbaError: string | null
}

async function sendActToElba(input: SendActToElbaInput): Promise<SendActToElbaResult> {
  const db = createAdminServer()
  try {
    const organizationId = await resolveOrganizationId()
    const contractorId = await ensureRetailContractorId(organizationId)

    const { elbaDocumentId, elbaUrl } = await submitActToElba({
      organizationId,
      contractorId,
      docNumber: input.docNumber,
      docDate: input.docDate,
      items: input.items,
      comment: input.comment,
    })

    await db
      .from('accounting_documents')
      .update({
        elba_document_id: elbaDocumentId,
        elba_url: elbaUrl,
        elba_sync_status: 'synced',
        elba_synced_at: new Date().toISOString(),
        elba_error: null,
        status: 'sent',
      })
      .eq('id', input.documentId)

    return {
      elbaSyncStatus: 'synced',
      elbaDocumentId,
      elbaUrl,
      elbaError: null,
    }
  } catch (err) {
    const message =
      err instanceof ElbaApiError
        ? `${err.statusCode}: ${err.message}`
        : (err as Error).message || 'Unknown error'
    logger.error(
      { doc_id: input.documentId, doc_number: input.docNumber, error: message },
      'Failed to send retail act to Elba'
    )
    await db
      .from('accounting_documents')
      .update({
        elba_sync_status: 'failed',
        elba_error: message,
      })
      .eq('id', input.documentId)
    return {
      elbaSyncStatus: 'failed',
      elbaDocumentId: null,
      elbaUrl: null,
      elbaError: message,
    }
  }
}

/**
 * Повторить отправку существующего АУ в Эльбу. Используется, когда при генерации
 * была ошибка сети или авторизации, а документ уже сохранён локально.
 */
export async function resendActToElba(documentId: string): Promise<SendActToElbaResult> {
  const doc = await getRetailAct(documentId)
  if (!doc) throw new Error(`Retail act ${documentId} not found`)
  if (doc.elba_sync_status === 'synced' && doc.elba_document_id) {
    return {
      elbaSyncStatus: 'synced',
      elbaDocumentId: doc.elba_document_id,
      elbaUrl: doc.elba_url,
      elbaError: null,
    }
  }

  // Восстановить lines из metadata + db lines
  const preview = await loadPreviewFromDocument(doc)
  const items = buildElbaItems(preview.lines)

  return sendActToElba({
    documentId,
    docNumber: doc.doc_number,
    docDate: doc.doc_date,
    items,
    comment: `Сервисный сбор Orbo за период ${doc.period_start} — ${doc.period_end}. Плательщики — розничные покупатели (физлица-участники).`,
  })
}

async function loadPreviewFromDocument(doc: RetailActDocument): Promise<RetailActPreview> {
  const payments = doc.metadata?.payments || []
  const rehydrated: RetailActPaymentDetail[] = payments.map((p) => {
    // Для исторических записей (до разделения на base/full) — классифицируем
    // по rate; если rate нет, остаётся unknown.
    const rate = (p as any).fee_rate != null ? Number((p as any).fee_rate) : null
    const feeType: RetailActFeeType =
      (p as any).fee_type ?? classifyFeeType(rate)
    return {
      income_id: p.income_id,
      payment_session_id: p.payment_session_id,
      event_registration_id: p.event_registration_id,
      amount: p.amount,
      created_at: p.created_at,
      event_id: p.event_id,
      event_title: p.event_title,
      org_id: p.org_id || '',
      org_name: p.org_name,
      fee_rate: rate,
      fee_type: feeType,
    }
  })
  const lines = groupPaymentsByEvent(rehydrated)
  return {
    periodStart: doc.period_start,
    periodEnd: doc.period_end,
    totalAmount: doc.total_amount,
    paymentsCount: doc.metadata?.payments_count || payments.length,
    eventsCount: doc.metadata?.events_count || lines.length,
    lines,
    payments: rehydrated,
  }
}

export async function getRetailAct(documentId: string): Promise<RetailActDocument | null> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `SELECT id, doc_number,
            to_char(doc_date, 'YYYY-MM-DD') AS doc_date,
            to_char(period_start, 'YYYY-MM-DD') AS period_start,
            to_char(period_end, 'YYYY-MM-DD') AS period_end,
            total_amount::numeric AS total_amount,
            html_url,
            metadata,
            elba_document_id,
            elba_url,
            elba_sync_status,
            elba_error
       FROM accounting_documents
      WHERE id = $1 AND doc_type = 'retail_act'
      LIMIT 1`,
    [documentId]
  )
  if (error) {
    logger.error({ error: error.message, documentId }, 'Failed to load retail act')
    return null
  }
  const row = data?.[0]
  if (!row) return null
  return {
    id: row.id,
    doc_number: row.doc_number,
    doc_date: row.doc_date,
    period_start: row.period_start,
    period_end: row.period_end,
    total_amount: parseFloat(row.total_amount),
    html_url: row.html_url,
    metadata: row.metadata || { payments_count: 0, events_count: 0, payments: [] },
    elba_document_id: row.elba_document_id,
    elba_url: row.elba_url,
    elba_sync_status: row.elba_sync_status,
    elba_error: row.elba_error,
  }
}

/**
 * Собрать ZIP-архив с актом и реестром-расшифровкой.
 * Акт и реестр формируются на лету из сохранённых данных.
 */
export async function buildActArchive(
  documentId: string
): Promise<{ filename: string; buffer: Buffer } | null> {
  const doc = await getRetailAct(documentId)
  if (!doc) return null

  const preview = await loadPreviewFromDocument(doc)

  const actHtml = buildRetailActHtml({
    docNumber: doc.doc_number,
    docDate: doc.doc_date,
    periodStart: doc.period_start,
    periodEnd: doc.period_end,
    lines: preview.lines,
    totalAmount: doc.total_amount,
    paymentsCount: preview.paymentsCount,
    elbaUrl: doc.elba_url,
  })

  const registryHtml = buildRetailActRegistryHtml({
    docNumber: doc.doc_number,
    docDate: doc.doc_date,
    periodStart: doc.period_start,
    periodEnd: doc.period_end,
    totalAmount: doc.total_amount,
    paymentsCount: preview.paymentsCount,
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
      fee_rate: p.fee_rate,
      fee_type: p.fee_type,
    })),
  })

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const safeNumber = doc.doc_number.replace(/[^a-zA-Zа-яА-ЯёЁ0-9-]/g, '_')
  zip.file(`Акт_${safeNumber}.html`, actHtml)
  zip.file(`Реестр_${safeNumber}.html`, registryHtml)

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  return { filename: `retail-act-${safeNumber}.zip`, buffer }
}
