/**
 * Отправка акта лицензии (АЛ) в Контур.Эльбу.
 *
 * Вызывается fire-and-forget из subscriptionActService сразу после insert'а
 * записи в accounting_documents. Если отправка падает — накопившиеся failed
 * можно переотправить через /api/superadmin/accounting/subscription-act/[id]/resend
 * или через крон (периодический retry).
 *
 * Для каждой организации-клиента используется отдельный контрагент в Эльбе
 * (таблица `organizations.elba_contractor_id`, см. elbaContractorResolver.ts).
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import {
  submitActToElba,
  ElbaApiError,
  type ElbaActItem,
} from '@/lib/services/elbaApiClient'
import { ensureOrgElbaContractor } from '@/lib/services/elbaContractorResolver'

const logger = createServiceLogger('SubscriptionActElbaSync')

export interface SubscriptionActElbaResult {
  status: 'synced' | 'failed'
  elbaDocumentId: string | null
  elbaUrl: string | null
  error: string | null
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}

/**
 * Формирует позиции для отправки в Эльбу по строкам accounting_documents.lines.
 * Обычно у АЛ одна строка — передача прав по тарифу.
 */
function buildElbaItems(lines: any[], total: number): ElbaActItem[] {
  if (Array.isArray(lines) && lines.length > 0) {
    return lines.map((l) => ({
      productName: truncate(String(l.name || 'Использование ПО Orbo'), 2000),
      quantity: Number(l.quantity) || 1,
      unitName: String(l.unit || 'усл. ед.'),
      price: Number(l.price) || Number(l.sum) || total,
      ndsRate: null,
    }))
  }
  // Fallback
  return [
    {
      productName: 'Передача неисключительных прав на использование ПО «Orbo»',
      quantity: 1,
      unitName: 'усл. ед.',
      price: total,
      ndsRate: null,
    },
  ]
}

/**
 * Загружает акт из accounting_documents, создаёт контрагента в Эльбе (если нет)
 * и отправляет акт. Обновляет elba_* колонки в accounting_documents.
 */
export async function sendSubscriptionActToElba(
  documentId: string
): Promise<SubscriptionActElbaResult> {
  const db = createAdminServer()

  const { data: rows, error: loadErr } = await db.raw(
    `SELECT
       d.id, d.doc_number,
       to_char(d.doc_date, 'YYYY-MM-DD') AS doc_date,
       to_char(d.period_start, 'YYYY-MM-DD') AS period_start,
       to_char(d.period_end, 'YYYY-MM-DD') AS period_end,
       d.org_id, d.customer_type, d.customer_requisites,
       d.total_amount::numeric AS total_amount,
       d.lines,
       d.elba_document_id, d.elba_sync_status
     FROM accounting_documents d
     WHERE d.id = $1 AND d.doc_type = 'subscription_act'
     LIMIT 1`,
    [documentId]
  )
  if (loadErr) {
    throw new Error(`Failed to load subscription act: ${loadErr.message}`)
  }
  const doc = rows?.[0]
  if (!doc) throw new Error(`Subscription act ${documentId} not found`)

  // Уже отправлен — не повторяем
  if (doc.elba_sync_status === 'synced' && doc.elba_document_id) {
    return {
      status: 'synced',
      elbaDocumentId: doc.elba_document_id,
      elbaUrl: null,
      error: null,
    }
  }

  // Физлицам АЛ не выставляется — в норме sendToElba для них не вызывается,
  // но страхуемся от некорректных записей в БД.
  if (doc.customer_type === 'individual') {
    logger.warn(
      { doc_id: documentId, doc_number: doc.doc_number },
      'Attempt to send individual АЛ to Elba skipped (should not have been created)'
    )
    return {
      status: 'failed',
      elbaDocumentId: null,
      elbaUrl: null,
      error: 'Individual customer: АЛ не должен отправляться в Эльбу',
    }
  }

  const cr = doc.customer_requisites || {}
  const snapshot = {
    name: String(cr.name || '').trim(),
    inn: cr.inn || null,
    kpp: cr.kpp || null,
    ogrn: cr.ogrn || null,
    legalAddress: cr.legal_address || null,
    email: cr.email || null,
    phone: cr.phone || null,
  }

  if (!snapshot.name) {
    return markFailed(documentId, 'Отсутствует наименование контрагента в customer_requisites')
  }

  try {
    const { elbaOrganizationId, contractorId } = await ensureOrgElbaContractor(
      doc.org_id,
      snapshot
    )

    const lines = typeof doc.lines === 'string' ? JSON.parse(doc.lines) : doc.lines || []
    const total = Number(doc.total_amount) || 0

    const { elbaDocumentId, elbaUrl } = await submitActToElba({
      organizationId: elbaOrganizationId,
      contractorId,
      docNumber: doc.doc_number,
      docDate: doc.doc_date,
      items: buildElbaItems(lines, total),
      comment: `Акт передачи неисключительных прав на ПО Orbo за период ${doc.period_start} — ${doc.period_end}.`,
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
      .eq('id', documentId)

    logger.info(
      {
        doc_id: documentId,
        doc_number: doc.doc_number,
        org_id: doc.org_id,
        elba_document_id: elbaDocumentId,
      },
      'Subscription act sent to Elba'
    )

    return { status: 'synced', elbaDocumentId, elbaUrl, error: null }
  } catch (err) {
    const message =
      err instanceof ElbaApiError
        ? `${err.statusCode}: ${err.message}`
        : (err as Error).message || 'Unknown error'
    logger.error(
      { doc_id: documentId, doc_number: doc.doc_number, org_id: doc.org_id, error: message },
      'Failed to send subscription act to Elba'
    )
    return markFailed(documentId, message)
  }
}

async function markFailed(
  documentId: string,
  error: string
): Promise<SubscriptionActElbaResult> {
  const db = createAdminServer()
  await db
    .from('accounting_documents')
    .update({
      elba_sync_status: 'failed',
      elba_error: error,
    })
    .eq('id', documentId)
  return {
    status: 'failed',
    elbaDocumentId: null,
    elbaUrl: null,
    error,
  }
}
