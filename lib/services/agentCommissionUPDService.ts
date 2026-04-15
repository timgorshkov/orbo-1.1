/**
 * Agent Commission UPD Service
 *
 * Формирует ежемесячный УПД (Универсальный Передаточный Документ, статус «2» —
 * только акт без счёта-фактуры) на агентское вознаграждение ООО Орбо от имени
 * организаторов мероприятий (принципалов).
 *
 * Условия формирования:
 * - Контрагент по договору — юрлицо или ИП (для физлиц комиссия = 0, УПД не нужен)
 * - За период есть ненулевая агентская комиссия в org_transactions
 *
 * Нумерация: АВ-{seq}, sequence agent_commission_upd_seq.
 * Хранение: структурно в accounting_documents + HTML в S3.
 * Идемпотентность: уникальный индекс (org_id, period_start, period_end) в миграции 279.
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { ORBO_ENTITY, orboSupplierSnapshot } from '@/lib/config/orbo-entity'
import { buildAgentCommissionUPDHtml } from '@/lib/templates/accounting/agent-commission-upd-html'

const logger = createServiceLogger('AgentCommissionUPDService')

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentCommissionUPDResult {
  documentId: string | null
  docNumber: string | null
  htmlUrl: string | null
  skipped?:
    | 'individual_counterparty'
    | 'zero_commission'
    | 'no_contract'
    | 'already_exists'
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

async function generateUPDNumber(): Promise<string> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `SELECT next_agent_commission_upd_number() AS number`,
    []
  )
  if (error) throw new Error(`Failed to generate UPD number: ${error.message}`)
  return data?.[0]?.number || 'АВ-1'
}

// ─── Main entry point ──────────────────────────────────────────────

/**
 * Генерирует УПД на агентскую комиссию за указанный месяц.
 * Возвращает null-значения если формирование пропущено (с указанием причины в skipped).
 */
export async function generateMonthlyCommissionUPD(
  orgId: string,
  year: number,
  month: number
): Promise<AgentCommissionUPDResult> {
  const db = createAdminServer()

  const periodStartDate = new Date(year, month - 1, 1)
  const periodEndDate = new Date(year, month, 0) // последний день месяца
  const periodStart = formatISODate(periodStartDate)
  const periodEnd = formatISODate(periodEndDate)

  // 1. Идемпотентность — проверить существующий документ за период
  const { data: existing } = await db
    .from('accounting_documents')
    .select('id, doc_number, html_url')
    .eq('doc_type', 'agent_commission_upd')
    .eq('org_id', orgId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()

  if (existing) {
    return {
      documentId: existing.id,
      docNumber: existing.doc_number,
      htmlUrl: existing.html_url,
      skipped: 'already_exists',
    }
  }

  // 2. Получить контракт и счёт принципала
  const { data: contractData } = await db.raw(
    `SELECT
       c.id AS contract_id,
       c.contract_number,
       c.contract_date,
       cp.type AS cp_type,
       cp.full_name,
       cp.org_name,
       cp.inn,
       cp.kpp,
       cp.ogrn,
       cp.legal_address,
       cp.signatory_name,
       cp.signatory_position,
       cp.phone AS cp_phone,
       cp.email AS cp_email,
       ba.bank_name,
       ba.bik,
       ba.correspondent_account,
       ba.settlement_account
     FROM contracts c
     JOIN counterparties cp ON cp.id = c.counterparty_id
     LEFT JOIN bank_accounts ba ON ba.id = c.bank_account_id
     WHERE c.org_id = $1 AND c.status IN ('verified', 'signed')
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [orgId]
  )
  const contract = contractData?.[0]

  if (!contract) {
    logger.info({ org_id: orgId, period: `${year}-${month}` }, 'No active contract, skipping UPD')
    return {
      documentId: null,
      docNumber: null,
      htmlUrl: null,
      skipped: 'no_contract',
    }
  }

  if (contract.cp_type !== 'legal_entity') {
    logger.info(
      { org_id: orgId, period: `${year}-${month}`, cp_type: contract.cp_type },
      'Counterparty is individual, commission is 0 — UPD not required'
    )
    return {
      documentId: null,
      docNumber: null,
      htmlUrl: null,
      skipped: 'individual_counterparty',
    }
  }

  // 3. Просуммировать агентскую комиссию за период
  //    org_transactions.type = 'agent_commission' хранится со знаком минус (удержание)
  //    берём ABS для документа. Возвратная комиссия (agent_commission_reversal, плюс) вычитается.
  const { data: commRows } = await db.raw(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'agent_commission' THEN ABS(amount) ELSE 0 END), 0) AS commission_deducted,
       COALESCE(SUM(CASE WHEN type = 'agent_commission_reversal' THEN amount ELSE 0 END), 0) AS commission_reversed,
       COALESCE(SUM(CASE WHEN type = 'payment_incoming' THEN amount ELSE 0 END), 0) AS sales_base
     FROM org_transactions
     WHERE org_id = $1
       AND created_at >= $2::date
       AND created_at < ($3::date + interval '1 day')`,
    [orgId, periodStart, periodEnd]
  )

  const commissionDeducted = parseFloat(commRows?.[0]?.commission_deducted || 0)
  const commissionReversed = parseFloat(commRows?.[0]?.commission_reversed || 0)
  const salesBase = parseFloat(commRows?.[0]?.sales_base || 0)
  const commissionAmount = Math.round((commissionDeducted - commissionReversed) * 100) / 100

  if (commissionAmount <= 0) {
    logger.info(
      { org_id: orgId, period: `${year}-${month}` },
      'Zero (or negative) commission for period, skipping UPD'
    )
    return {
      documentId: null,
      docNumber: null,
      htmlUrl: null,
      skipped: 'zero_commission',
    }
  }

  // Ставка берётся из org_accounts (актуальная) — для снапшота на момент генерации.
  // При изменении ставки в будущем старые УПД не пересчитываются.
  const { data: accountRow } = await db
    .from('org_accounts')
    .select('agent_commission_rate')
    .eq('org_id', orgId)
    .maybeSingle()
  const commissionRate = accountRow?.agent_commission_rate != null
    ? parseFloat(accountRow.agent_commission_rate)
    : 0.05 // дефолт для юрлиц

  // 4. Найти связанный отчёт агента за тот же период (для перекрёстной ссылки)
  const { data: reportRow } = await db
    .from('agent_reports')
    .select('id, report_number')
    .eq('org_id', orgId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()

  // 5. Сгенерировать номер УПД
  const docNumber = await generateUPDNumber()
  const docDate = periodEnd // УПД датируется последним днём отчётного периода

  // 6. Собрать данные принципала для снапшота
  const principalName = contract.org_name || contract.full_name || '—'
  const principalRequisites = {
    name: principalName,
    customer_type: contract.cp_type,
    inn: contract.inn || null,
    kpp: contract.kpp || null,
    ogrn: contract.ogrn || null,
    legal_address: contract.legal_address || null,
    email: contract.cp_email || null,
    phone: contract.cp_phone || null,
    signatory_name: contract.signatory_name || null,
    signatory_position: contract.signatory_position || null,
    bank_name: contract.bank_name || null,
    bik: contract.bik || null,
    correspondent_account: contract.correspondent_account || null,
    settlement_account: contract.settlement_account || null,
  }

  // 7. Построить HTML
  const html = buildAgentCommissionUPDHtml({
    docNumber,
    docDate,
    periodStart,
    periodEnd,
    contractNumber: contract.contract_number || null,
    contractDate: contract.contract_date || null,
    commissionRate,
    totalSalesBase: salesBase,
    commissionAmount,
    agentReportNumber: reportRow?.report_number || null,
    principal: {
      type: contract.cp_type,
      name: principalName,
      inn: contract.inn || null,
      kpp: contract.kpp || null,
      ogrn: contract.ogrn || null,
      legalAddress: contract.legal_address || null,
      signatoryName: contract.signatory_name || null,
      signatoryPosition: contract.signatory_position || null,
      bankName: contract.bank_name || null,
      bik: contract.bik || null,
      correspondentAccount: contract.correspondent_account || null,
      settlementAccount: contract.settlement_account || null,
    },
  })

  // 8. Загрузить HTML в S3
  const { createStorage, getBucket, getStoragePath } = await import('@/lib/storage')
  const storage = createStorage()
  const bucket = getBucket('documents')
  const filename = docNumber.replace(/[^a-zA-Zа-яА-ЯёЁ0-9-]/g, '_')
  const localPath = `agent-commission-upds/${orgId}/${filename}.html`
  const storagePath = getStoragePath('documents', localPath)

  await storage.upload(bucket, storagePath, Buffer.from(html, 'utf-8'), {
    contentType: 'text/html; charset=utf-8',
  })

  const htmlUrl = storage.getPublicUrl(bucket, storagePath)

  // 9. Записать структурированный документ
  const ratePct = (commissionRate * 100).toFixed(2).replace(/\.?0+$/, '')
  const serviceLineName = `Агентское вознаграждение за организацию приёма платежей участников мероприятий за период с ${periodStart} по ${periodEnd}, ${ratePct}% от принятой суммы`

  const lines = [
    {
      name: serviceLineName,
      unit: 'усл. ед.',
      unit_code: '796',
      quantity: 1,
      price: commissionAmount,
      sum: commissionAmount,
      vat_rate: 'Без НДС',
    },
  ]

  const { data: docRow, error: docErr } = await db
    .from('accounting_documents')
    .insert({
      doc_type: 'agent_commission_upd',
      doc_number: docNumber,
      doc_date: docDate,
      period_start: periodStart,
      period_end: periodEnd,
      org_id: orgId,
      agent_report_id: reportRow?.id || null,
      contract_id: contract.contract_id,
      supplier_requisites: orboSupplierSnapshot(),
      customer_requisites: principalRequisites,
      customer_type: contract.cp_type, // 'legal_entity' всегда для этого сервиса
      lines: JSON.stringify(lines),
      total_amount: commissionAmount,
      currency: 'RUB',
      html_url: htmlUrl,
      status: 'generated',
      metadata: {
        commission_rate: commissionRate,
        commission_deducted: commissionDeducted,
        commission_reversed: commissionReversed,
        sales_base: salesBase,
        agent_report_number: reportRow?.report_number || null,
      },
    })
    .select('id, doc_number, html_url')
    .single()

  if (docErr || !docRow) {
    logger.error(
      { org_id: orgId, period: `${year}-${month}`, error: docErr?.message },
      'Failed to insert agent commission UPD'
    )
    throw new Error(`Failed to create agent commission UPD: ${docErr?.message}`)
  }

  logger.info(
    {
      org_id: orgId,
      period: `${year}-${month}`,
      doc_number: docNumber,
      commission_amount: commissionAmount,
      commission_rate: commissionRate,
      supplier: ORBO_ENTITY.shortName,
    },
    'Agent commission UPD generated'
  )

  return {
    documentId: docRow.id,
    docNumber,
    htmlUrl,
  }
}
