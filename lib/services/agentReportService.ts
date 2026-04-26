/**
 * Agent Report Service
 *
 * Формирование ежемесячных отчётов агента (ст. 1008 ГК РФ).
 * Отчёт содержит: реестр продаж, возвратов, сервисный сбор, агентское вознаграждение,
 * сумму к перечислению принципалу.
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('AgentReportService')

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentReport {
  id: string
  org_id: string
  contract_id: string | null
  report_number: string
  period_start: string
  period_end: string
  total_sales_amount: number
  total_service_fee: number
  total_agent_commission: number
  total_refunds: number
  total_to_transfer: number
  total_transferred: number
  sales_count: number
  refunds_count: number
  document_url: string | null
  status: 'draft' | 'generated' | 'sent' | 'accepted'
  metadata: Record<string, any>
  created_at: string
}

interface ReportSalesItem {
  date: string
  event_name: string
  participant_name: string
  ticket_price: number
  service_fee: number
  total_amount: number
}

// ─── ОРБО company data ─────────────────────────────────────────────

import { ORBO_ENTITY } from '@/lib/config/orbo-entity'

const ORBO_COMPANY = {
  name: ORBO_ENTITY.shortName,
  inn: ORBO_ENTITY.inn,
  kpp: ORBO_ENTITY.kpp,
}

// ─── Generate Report ───────────────────────────────────────────────

/**
 * Генерирует отчёт агента за указанный период для организации.
 */
export async function generateMonthlyReport(
  orgId: string,
  year: number,
  month: number
): Promise<AgentReport | null> {
  const db = createAdminServer()

  const periodStart = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const periodEnd = new Date(year, month, 0).toISOString().split('T')[0] // last day of month

  // Check if report already exists for this period
  const { data: existing } = await db
    .from('agent_reports')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_start', periodStart)
    .maybeSingle()

  if (existing) {
    logger.info({ org_id: orgId, period: `${year}-${month}` }, 'Report already exists for period')
    return existing as AgentReport
  }

  // Get contract info
  const { data: contractData } = await db.raw(
    `SELECT c.id, c.contract_number, cp.type AS cp_type, cp.full_name, cp.org_name, cp.inn
     FROM contracts c
     JOIN counterparties cp ON cp.id = c.counterparty_id
     WHERE c.org_id = $1 AND c.status != 'terminated'
     ORDER BY c.created_at DESC LIMIT 1`,
    [orgId]
  )
  const contract = contractData?.[0]

  // Aggregate sales data from platform_income for the period
  const { data: salesData } = await db.raw(
    `SELECT
       COALESCE(SUM(CASE WHEN income_type = 'service_fee' THEN amount ELSE 0 END), 0) AS total_service_fee,
       COALESCE(SUM(CASE WHEN income_type = 'agent_commission' THEN amount ELSE 0 END), 0) AS total_agent_commission,
       COALESCE(SUM(CASE WHEN income_type = 'service_fee_refund' THEN amount ELSE 0 END), 0) AS total_service_fee_refund,
       COALESCE(SUM(CASE WHEN income_type = 'agent_commission_refund' THEN amount ELSE 0 END), 0) AS total_agent_commission_refund,
       COUNT(CASE WHEN income_type = 'service_fee' THEN 1 END)::int AS sales_count,
       COUNT(CASE WHEN income_type = 'service_fee_refund' THEN 1 END)::int AS refunds_count
     FROM platform_income
     WHERE org_id = $1
       AND created_at >= $2::date
       AND created_at < ($3::date + interval '1 day')`,
    [orgId, periodStart, periodEnd]
  )

  // Aggregate ticket prices from org_transactions (payment_incoming)
  const { data: txData } = await db.raw(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'payment_incoming' THEN amount ELSE 0 END), 0) AS total_ticket_sales,
       COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(amount) ELSE 0 END), 0) AS total_refunds
     FROM org_transactions
     WHERE org_id = $1
       AND created_at >= $2::date
       AND created_at < ($3::date + interval '1 day')`,
    [orgId, periodStart, periodEnd]
  )

  // Withdrawals requested in the period — used both for the report registry and to
  // surface "already withdrawn" in the to-transfer formula. Take only completed ones
  // for the formula; show all (incl. processing/rejected) in the registry for context.
  const { data: wdData } = await db.raw(
    `SELECT id, status, amount, net_amount, act_number, requested_at, completed_at, period_from, period_to
       FROM org_withdrawals
      WHERE org_id = $1
        AND requested_at >= $2::date
        AND requested_at < ($3::date + interval '1 day')
      ORDER BY requested_at ASC`,
    [orgId, periodStart, periodEnd]
  )

  // Refund detail — for the registry section in the report. Pair refund tx with their
  // commission_reversal counterparts (where applicable) by participant + ~timestamp window.
  const { data: refundsDetail } = await db.raw(
    `SELECT t.id, t.created_at, t.amount, t.event_id, e.title AS event_title,
            t.participant_id, p.full_name AS participant_name, t.notes,
            t.type
       FROM org_transactions t
       LEFT JOIN events e ON e.id = t.event_id
       LEFT JOIN participants p ON p.id = t.participant_id
      WHERE t.org_id = $1
        AND t.type IN ('refund', 'agent_commission_reversal')
        AND t.created_at >= $2::date
        AND t.created_at < ($3::date + interval '1 day')
      ORDER BY t.created_at ASC`,
    [orgId, periodStart, periodEnd]
  )

  const sales = salesData?.[0]
  const tx = txData?.[0]

  const totalSalesAmount = parseFloat(tx?.total_ticket_sales || 0)
  const totalServiceFee = parseFloat(sales?.total_service_fee || 0)
  const totalAgentCommission = parseFloat(sales?.total_agent_commission || 0)
  const totalRefunds = parseFloat(tx?.total_refunds || 0)
  const salesCount = parseInt(sales?.sales_count || 0)
  const refundsCount = parseInt(sales?.refunds_count || 0)

  // Already withdrawn within the period (only successful payouts reduce remaining balance)
  const totalAlreadyWithdrawn = ((wdData || []) as any[])
    .filter((w: any) => w.status === 'completed')
    .reduce((acc: number, w: any) => acc + parseFloat(w.amount), 0)

  // К перечислению = поступления - агентское вознаграждение - возвраты - уже выведено в этот период
  const totalToTransfer = totalSalesAmount - totalAgentCommission - totalRefunds - totalAlreadyWithdrawn

  // Skip report if no sales
  if (salesCount === 0 && refundsCount === 0) {
    logger.info({ org_id: orgId, period: `${year}-${month}` }, 'No sales in period, skipping report generation')
    return null
  }

  // Generate report number
  const { data: numData } = await db.raw(`SELECT generate_agent_report_number() AS num`)
  const reportNumber = numData?.[0]?.num || `ОА-${Date.now()}`

  // Insert report
  const { data: report, error } = await db
    .from('agent_reports')
    .insert({
      org_id: orgId,
      contract_id: contract?.id || null,
      report_number: reportNumber,
      period_start: periodStart,
      period_end: periodEnd,
      total_sales_amount: totalSalesAmount,
      total_service_fee: totalServiceFee,
      total_agent_commission: totalAgentCommission,
      total_refunds: totalRefunds,
      total_to_transfer: totalToTransfer,
      total_transferred: 0,
      sales_count: salesCount,
      refunds_count: refundsCount,
      status: 'generated',
      metadata: {
        counterparty_type: contract?.cp_type,
        counterparty_name: contract?.cp_type === 'legal_entity' ? contract?.org_name : contract?.full_name,
        counterparty_inn: contract?.inn,
        total_already_withdrawn: totalAlreadyWithdrawn,
        // Registries surfaced in the printed HTML report
        withdrawals: (wdData || []).map((w: any) => ({
          id: w.id,
          status: w.status,
          amount: parseFloat(w.amount),
          net_amount: parseFloat(w.net_amount),
          act_number: w.act_number,
          requested_at: w.requested_at,
          completed_at: w.completed_at,
        })),
        refunds_detail: (refundsDetail || []).map((r: any) => ({
          id: r.id,
          created_at: r.created_at,
          type: r.type,
          amount: parseFloat(r.amount),
          event_title: r.event_title,
          participant_name: r.participant_name,
          notes: r.notes,
        })),
      },
    })
    .select('*')
    .single()

  if (error) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to create agent report')
    return null
  }

  logger.info({
    report_id: report.id,
    report_number: reportNumber,
    org_id: orgId,
    period: `${year}-${month}`,
    sales_count: salesCount,
    total_sales: totalSalesAmount,
  }, 'Agent report generated')

  return report as AgentReport
}

// ─── List Reports ──────────────────────────────────────────────────

/**
 * Получает отчёты для организации.
 */
export async function getReportsByOrg(
  orgId: string,
  limit: number = 24
): Promise<AgentReport[]> {
  const db = createAdminServer()
  const { data } = await db
    .from('agent_reports')
    .select('*')
    .eq('org_id', orgId)
    .order('period_start', { ascending: false })
    .limit(limit)

  return (data || []) as AgentReport[]
}

/**
 * Получает все отчёты (для суперадмина).
 */
export async function getAllReports(
  status?: string,
  limit: number = 50
): Promise<AgentReport[]> {
  const db = createAdminServer()
  let query = db
    .from('agent_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data } = await query
  return (data || []) as AgentReport[]
}

/**
 * Обновляет статус отчёта.
 */
export async function updateReportStatus(
  reportId: string,
  status: string,
  documentUrl?: string
): Promise<{ error: string | null }> {
  const db = createAdminServer()
  const updates: Record<string, any> = { status }
  if (documentUrl) updates.document_url = documentUrl

  const { error } = await db
    .from('agent_reports')
    .update(updates)
    .eq('id', reportId)

  if (error) {
    logger.error({ error: error.message, report_id: reportId }, 'Failed to update report status')
    return { error: error.message }
  }

  return { error: null }
}

/**
 * Генерирует HTML-документ отчёта агента.
 */
export function generateReportHTML(report: AgentReport): string {
  const meta = report.metadata as any || {}
  const periodLabel = new Date(report.period_start).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Отчёт агента ${report.report_number}</title>
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 40px; }
    h1 { font-size: 14pt; text-align: center; margin-bottom: 20px; }
    .header { margin-bottom: 20px; }
    .header p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #333; padding: 5px 8px; text-align: left; font-size: 10pt; }
    th { background: #f5f5f5; font-weight: bold; }
    .right { text-align: right; }
    .total-row { font-weight: bold; background: #f9f9f9; }
    .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
    .sign-block { width: 45%; }
    .sign-line { border-bottom: 1px solid #333; margin-top: 30px; padding-bottom: 2px; }
  </style>
</head>
<body>
  <h1>ОТЧЁТ АГЕНТА № ${report.report_number}</h1>
  <h2 style="text-align:center; font-size:12pt; font-weight:normal;">за ${periodLabel}</h2>

  <div class="header">
    <p><strong>Агент:</strong> ${ORBO_COMPANY.name}, ИНН ${ORBO_COMPANY.inn}, КПП ${ORBO_COMPANY.kpp}</p>
    <p><strong>Принципал:</strong> ${meta.counterparty_name || '—'}${meta.counterparty_inn ? `, ИНН ${meta.counterparty_inn}` : ''}</p>
    <p><strong>Период:</strong> ${new Date(report.period_start).toLocaleDateString('ru-RU')} — ${new Date(report.period_end).toLocaleDateString('ru-RU')}</p>
  </div>

  <table>
    <tr><th>Показатель</th><th class="right">Значение</th></tr>
    <tr><td>Продано билетов</td><td class="right">${report.sales_count} шт.</td></tr>
    <tr><td>Сумма продаж (номинал билетов)</td><td class="right">${parseFloat(String(report.total_sales_amount)).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽</td></tr>
    <tr><td>Сервисный сбор (доход Агента)</td><td class="right">${parseFloat(String(report.total_service_fee)).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽</td></tr>
    ${parseFloat(String(report.total_agent_commission)) > 0 ? `<tr><td>Агентское вознаграждение</td><td class="right">${parseFloat(String(report.total_agent_commission)).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽</td></tr>` : ''}
    <tr><td>Возвраты</td><td class="right">${report.refunds_count} шт. / ${parseFloat(String(report.total_refunds)).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽</td></tr>
    ${parseFloat(String(meta.total_already_withdrawn || 0)) > 0 ? `<tr><td>Уже выведено в течение периода</td><td class="right">${parseFloat(String(meta.total_already_withdrawn)).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽</td></tr>` : ''}
    <tr class="total-row"><td>К перечислению Принципалу</td><td class="right">${parseFloat(String(report.total_to_transfer)).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽</td></tr>
  </table>

  ${renderRefundsRegistry(meta.refunds_detail)}
  ${renderWithdrawalsRegistry(meta.withdrawals)}

  <div class="signatures">
    <div class="sign-block">
      <p><strong>Агент:</strong></p>
      <p>${ORBO_COMPANY.name}</p>
      <div class="sign-line"></div>
      <p style="font-size:9pt; color:#666;">подпись / дата</p>
    </div>
    <div class="sign-block">
      <p><strong>Принципал:</strong></p>
      <p>${meta.counterparty_name || '—'}</p>
      <div class="sign-line"></div>
      <p style="font-size:9pt; color:#666;">подпись / дата</p>
    </div>
  </div>
</body>
</html>`
}

// ─── HTML helpers ──────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderRefundsRegistry(refunds: any[] | undefined | null): string {
  if (!refunds || refunds.length === 0) return ''
  const rows = refunds.map((r) => {
    const dt = new Date(r.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const typeLabel = r.type === 'agent_commission_reversal' ? 'Реверс комиссии' : 'Возврат тела билета'
    const amount = parseFloat(r.amount).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
    return `<tr>
      <td>${dt}</td>
      <td>${typeLabel}</td>
      <td>${escapeHtml(r.event_title) || '—'}</td>
      <td>${escapeHtml(r.participant_name) || '—'}</td>
      <td class="right">${amount} ₽</td>
    </tr>`
  }).join('')
  return `
  <h3 style="margin-top:24px; font-size:12pt;">Реестр возвратов</h3>
  <table>
    <tr><th>Дата</th><th>Тип</th><th>Событие</th><th>Участник</th><th class="right">Сумма</th></tr>
    ${rows}
  </table>`
}

function renderWithdrawalsRegistry(withdrawals: any[] | undefined | null): string {
  if (!withdrawals || withdrawals.length === 0) return ''
  const STATUS_LABELS: Record<string, string> = {
    requested: 'Запрошен',
    processing: 'В обработке',
    completed: 'Выплачено',
    rejected: 'Отклонён',
  }
  const rows = withdrawals.map((w) => {
    const reqDt = w.requested_at ? new Date(w.requested_at).toLocaleDateString('ru-RU') : '—'
    const compDt = w.completed_at ? new Date(w.completed_at).toLocaleDateString('ru-RU') : '—'
    const amount = parseFloat(w.amount).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
    return `<tr>
      <td>${reqDt}</td>
      <td>${compDt}</td>
      <td>${STATUS_LABELS[w.status] || w.status}</td>
      <td>${escapeHtml(w.act_number) || '—'}</td>
      <td class="right">${amount} ₽</td>
    </tr>`
  }).join('')
  return `
  <h3 style="margin-top:24px; font-size:12pt;">Заявки на вывод средств за период</h3>
  <table>
    <tr><th>Запрошено</th><th>Завершено</th><th>Статус</th><th>№ акта</th><th class="right">Сумма</th></tr>
    ${rows}
  </table>`
}

/**
 * Генерирует отчёты за предыдущий месяц для всех орг с активными контрактами,
 * и сразу после — УПД на агентское вознаграждение (для юрлиц с ненулевой комиссией).
 */
export async function generateAllPendingReports(): Promise<{
  generated: number
  skipped: number
  upd_generated: number
  upd_skipped: number
  upd_failed: number
}> {
  const db = createAdminServer()

  // Previous month
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 12 : now.getMonth() // getMonth is 0-based

  // Get all orgs with active contracts
  const { data: contracts } = await db.raw(
    `SELECT DISTINCT c.org_id
     FROM contracts c
     WHERE c.status IN ('verified', 'signed')`,
    []
  )

  let generated = 0
  let skipped = 0
  let updGenerated = 0
  let updSkipped = 0
  let updFailed = 0

  const { generateMonthlyCommissionUPD } = await import('./agentCommissionUPDService')

  for (const row of (contracts || [])) {
    const report = await generateMonthlyReport(row.org_id, year, month)
    if (report) {
      generated++
    } else {
      skipped++
    }

    // Независимо от результата отчёта пробуем сформировать УПД на комиссию
    // (он сам пропустит случай no_contract / individual / zero_commission).
    // Ошибка формирования УПД не должна рушить весь крон.
    try {
      const updResult = await generateMonthlyCommissionUPD(row.org_id, year, month)
      if (updResult.documentId && !updResult.skipped) {
        updGenerated++
      } else {
        updSkipped++
      }
    } catch (err: any) {
      updFailed++
      logger.error(
        { org_id: row.org_id, year, month, error: err.message },
        'Failed to generate agent commission UPD'
      )
    }
  }

  logger.info(
    { year, month, generated, skipped, upd_generated: updGenerated, upd_skipped: updSkipped, upd_failed: updFailed },
    'Monthly report + UPD generation completed'
  )
  return {
    generated,
    skipped,
    upd_generated: updGenerated,
    upd_skipped: updSkipped,
    upd_failed: updFailed,
  }
}
