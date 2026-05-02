/**
 * Withdrawal Service
 * Manages withdrawal requests from org accounts: create, process, complete, reject.
 * Generates withdrawal acts (PDF) and uploads to S3.
 *
 * Status flow: requested → processing → completed | rejected
 * Each status change creates a ledger entry via record_simple_transaction().
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { getOrgBalance } from './orgAccountService'
import { ORBO_ENTITY } from '@/lib/config/orbo-entity'

const logger = createServiceLogger('WithdrawalService')

// ─── Types ──────────────────────────────────────────────────────────

export type WithdrawalStatus = 'requested' | 'processing' | 'completed' | 'rejected'

export interface OrgWithdrawal {
  id: string
  org_id: string
  status: WithdrawalStatus
  amount: number
  commission_amount: number
  net_amount: number
  currency: string
  period_from: string | null
  period_to: string | null
  act_number: string
  act_document_url: string | null
  bank_account_id: string | null
  contract_id: string | null
  requested_transaction_id: string | null
  completed_transaction_id: string | null
  requested_by: string | null
  processed_by: string | null
  rejection_reason: string | null
  requested_at: string
  processed_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface WithdrawalItem {
  id: string
  withdrawal_id: string
  transaction_id: string | null
  description: string
  amount: number
  quantity: number
  total: number
  event_id: string | null
  event_name: string | null
  participant_count: number | null
  sort_order: number
  created_at: string
}

export interface WithdrawalWithItems extends OrgWithdrawal {
  items: WithdrawalItem[]
  org_name?: string
  bank_account?: {
    bik: string
    bank_name: string
    settlement_account: string
  } | null
}

export interface RequestWithdrawalParams {
  orgId: string
  amount: number
  currency?: string
  periodFrom?: string
  periodTo?: string
  bankAccountId?: string
  contractId?: string
  requestedBy: string
  items?: Array<{
    description: string
    amount: number
    quantity?: number
    total: number
    eventId?: string
    eventName?: string
    participantCount?: number
  }>
}

export interface WithdrawalFilter {
  status?: WithdrawalStatus | WithdrawalStatus[]
  orgId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

// ─── Request Withdrawal ─────────────────────────────────────────────

/**
 * Create a withdrawal request. Freezes funds via withdrawal_requested ledger entry.
 */
export async function requestWithdrawal(params: RequestWithdrawalParams): Promise<OrgWithdrawal> {
  const db = createAdminServer()

  // Check balance
  const balance = await getOrgBalance(params.orgId)
  if (balance < params.amount) {
    throw new Error(`Insufficient balance: ${balance} < ${params.amount}`)
  }

  // Check for active contract. Выплаты разрешены только если у организации
  // есть договор в статусе 'signed'. Если contractId передан явно — проверяем
  // именно его; если нет — ищем любой действующий договор организации.
  let contract: { id: string; status: string } | null = null
  if (params.contractId) {
    const { data } = await db
      .from('contracts')
      .select('id, status')
      .eq('id', params.contractId)
      .eq('org_id', params.orgId)
      .single()
    contract = (data as { id: string; status: string } | null) ?? null
  } else {
    const { data } = await db.raw(
      `SELECT id, status FROM contracts
         WHERE org_id = $1 AND status IN ('filled_by_client', 'verified', 'signed')
         ORDER BY CASE status
                    WHEN 'signed' THEN 1
                    WHEN 'verified' THEN 2
                    WHEN 'filled_by_client' THEN 3
                  END, created_at DESC
         LIMIT 1`,
      [params.orgId]
    )
    contract = (data?.[0] as { id: string; status: string } | null) ?? null
  }

  if (!contract) {
    throw new Error('Contract must be in signed status for withdrawal (no active contract found)')
  }
  if (contract.status !== 'signed') {
    throw new Error('Contract must be in signed status for withdrawal')
  }

  // Check min withdrawal amount
  const { data: account } = await db
    .from('org_accounts')
    .select('min_withdrawal_amount')
    .eq('org_id', params.orgId)
    .single()

  if (account && params.amount < parseFloat(account.min_withdrawal_amount)) {
    throw new Error(`Amount below minimum withdrawal: ${account.min_withdrawal_amount}`)
  }

  // Check no pending withdrawal exists
  const { data: existing } = await db
    .from('org_withdrawals')
    .select('id')
    .eq('org_id', params.orgId)
    .in('status', ['requested', 'processing'])
    .limit(1)

  if (existing && existing.length > 0) {
    throw new Error('A pending withdrawal already exists for this organization')
  }

  // For now commission_amount on withdrawal is 0 (reserved for future)
  const commissionAmount = 0
  const netAmount = params.amount - commissionAmount

  // Create withdrawal record
  const { data: withdrawal, error: wErr } = await db
    .from('org_withdrawals')
    .insert({
      org_id: params.orgId,
      status: 'requested',
      amount: params.amount,
      commission_amount: commissionAmount,
      net_amount: netAmount,
      currency: params.currency || 'RUB',
      period_from: params.periodFrom || null,
      period_to: params.periodTo || null,
      bank_account_id: params.bankAccountId || null,
      contract_id: params.contractId || null,
      requested_by: params.requestedBy,
      requested_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (wErr || !withdrawal) {
    logger.error({ org_id: params.orgId, error: wErr?.message }, 'Failed to create withdrawal')
    throw new Error(`Failed to create withdrawal: ${wErr?.message}`)
  }

  // Record ledger entry: freeze funds
  const idempotencyKey = `wd_req_${withdrawal.id}`
  const { data: txData, error: txErr } = await db.raw(
    `SELECT * FROM record_simple_transaction($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, $7, $8, $9)`,
    [
      params.orgId,
      'withdrawal_requested',
      -params.amount, // negative = funds frozen
      params.currency || 'RUB',
      idempotencyKey,
      withdrawal.id,
      'Заявка на вывод средств ' + withdrawal.act_number,
      JSON.stringify({}),
      params.requestedBy,
    ]
  )

  if (txErr) {
    // Rollback: delete the withdrawal
    await db.from('org_withdrawals').delete().eq('id', withdrawal.id)
    logger.error({ org_id: params.orgId, error: txErr.message }, 'Failed to record withdrawal transaction')
    throw new Error(`Failed to freeze funds: ${txErr.message}`)
  }

  // Update withdrawal with transaction id
  const txId = txData?.[0]?.transaction_id
  if (txId) {
    await db
      .from('org_withdrawals')
      .update({ requested_transaction_id: txId })
      .eq('id', withdrawal.id)
  }

  // Insert line items if provided
  if (params.items && params.items.length > 0) {
    const itemRows = params.items.map((item, idx) => ({
      withdrawal_id: withdrawal.id,
      description: item.description,
      amount: item.amount,
      quantity: item.quantity || 1,
      total: item.total,
      event_id: item.eventId || null,
      event_name: item.eventName || null,
      participant_count: item.participantCount || null,
      sort_order: idx,
    }))

    const { error: itemErr } = await db
      .from('org_withdrawal_items')
      .insert(itemRows)

    if (itemErr) {
      logger.error({ withdrawal_id: withdrawal.id, error: itemErr.message }, 'Failed to insert withdrawal items')
    }
  }

  logger.info({
    org_id: params.orgId,
    withdrawal_id: withdrawal.id,
    amount: params.amount,
    act_number: withdrawal.act_number,
  }, 'Withdrawal requested')

  return withdrawal as OrgWithdrawal
}

// ─── Process Withdrawal (Superadmin) ────────────────────────────────

/**
 * Mark withdrawal as processing (superadmin starts working on payout).
 */
export async function processWithdrawal(
  withdrawalId: string,
  processedBy: string
): Promise<OrgWithdrawal> {
  const db = createAdminServer()

  const { data: withdrawal, error } = await db
    .from('org_withdrawals')
    .update({
      status: 'processing',
      processed_by: processedBy,
      processed_at: new Date().toISOString(),
    })
    .eq('id', withdrawalId)
    .eq('status', 'requested')
    .select('*')
    .single()

  if (error || !withdrawal) {
    throw new Error(`Failed to process withdrawal: ${error?.message || 'Not found or wrong status'}`)
  }

  logger.info({ withdrawal_id: withdrawalId, processed_by: processedBy }, 'Withdrawal processing started')
  return withdrawal as OrgWithdrawal
}

// ─── Complete Withdrawal (Superadmin) ───────────────────────────────

/**
 * Mark withdrawal as completed. Records withdrawal_completed ledger entry.
 */
export async function completeWithdrawal(
  withdrawalId: string,
  completedBy: string
): Promise<OrgWithdrawal> {
  const db = createAdminServer()

  // Get withdrawal
  const { data: withdrawal, error: wErr } = await db
    .from('org_withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .eq('status', 'processing')
    .single()

  if (wErr || !withdrawal) {
    throw new Error(`Withdrawal not found or wrong status: ${wErr?.message || 'Not in processing status'}`)
  }

  // Record ledger entry: withdrawal completed (0 amount — funds already frozen)
  const idempotencyKey = `wd_done_${withdrawalId}`
  const { data: txData, error: txErr } = await db.raw(
    `SELECT * FROM record_simple_transaction($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, $7, $8, $9)`,
    [
      withdrawal.org_id,
      'withdrawal_completed',
      0, // no additional balance change — funds were already frozen at request time
      withdrawal.currency,
      idempotencyKey,
      withdrawalId,
      'Вывод средств завершён ' + withdrawal.act_number,
      JSON.stringify({}),
      completedBy,
    ]
  )

  if (txErr) {
    logger.error({ withdrawal_id: withdrawalId, error: txErr.message }, 'Failed to record completion transaction')
    throw new Error(`Failed to record completion: ${txErr.message}`)
  }

  const txId = txData?.[0]?.transaction_id

  // Update withdrawal status
  const { data: updated, error: uErr } = await db
    .from('org_withdrawals')
    .update({
      status: 'completed',
      completed_transaction_id: txId || null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', withdrawalId)
    .select('*')
    .single()

  if (uErr) {
    logger.error({ withdrawal_id: withdrawalId, error: uErr.message }, 'Failed to update withdrawal to completed')
    throw new Error(`Failed to complete withdrawal: ${uErr.message}`)
  }

  logger.info({
    withdrawal_id: withdrawalId,
    org_id: withdrawal.org_id,
    amount: withdrawal.amount,
    act_number: withdrawal.act_number,
  }, 'Withdrawal completed')

  return updated as OrgWithdrawal
}

// ─── Reject Withdrawal (Superadmin) ─────────────────────────────────

/**
 * Reject withdrawal. Unfreezes funds via withdrawal_rejected ledger entry.
 */
export async function rejectWithdrawal(
  withdrawalId: string,
  rejectedBy: string,
  reason: string
): Promise<OrgWithdrawal> {
  const db = createAdminServer()

  // Get withdrawal
  const { data: withdrawal, error: wErr } = await db
    .from('org_withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .single()

  if (wErr || !withdrawal) {
    throw new Error(`Withdrawal not found: ${wErr?.message}`)
  }

  if (withdrawal.status !== 'requested' && withdrawal.status !== 'processing') {
    throw new Error(`Cannot reject withdrawal in status: ${withdrawal.status}`)
  }

  // Record ledger entry: unfreeze funds
  const idempotencyKey = `wd_rej_${withdrawalId}`
  const { data: txData, error: txErr } = await db.raw(
    `SELECT * FROM record_simple_transaction($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, $7, $8, $9)`,
    [
      withdrawal.org_id,
      'withdrawal_rejected',
      parseFloat(withdrawal.amount), // positive = funds unfrozen
      withdrawal.currency,
      idempotencyKey,
      withdrawalId,
      'Заявка на вывод отклонена: ' + reason,
      JSON.stringify({ reason }),
      rejectedBy,
    ]
  )

  if (txErr) {
    logger.error({ withdrawal_id: withdrawalId, error: txErr.message }, 'Failed to record rejection transaction')
    throw new Error(`Failed to unfreeze funds: ${txErr.message}`)
  }

  // Update withdrawal
  const { data: updated, error: uErr } = await db
    .from('org_withdrawals')
    .update({
      status: 'rejected',
      processed_by: rejectedBy,
      processed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', withdrawalId)
    .select('*')
    .single()

  if (uErr) {
    logger.error({ withdrawal_id: withdrawalId, error: uErr.message }, 'Failed to update withdrawal to rejected')
    throw new Error(`Failed to reject withdrawal: ${uErr.message}`)
  }

  logger.info({
    withdrawal_id: withdrawalId,
    org_id: withdrawal.org_id,
    amount: withdrawal.amount,
    reason,
  }, 'Withdrawal rejected')

  return updated as OrgWithdrawal
}

// ─── Query Functions ────────────────────────────────────────────────

/**
 * Get withdrawal by ID with items.
 */
export async function getWithdrawalById(withdrawalId: string): Promise<WithdrawalWithItems | null> {
  const db = createAdminServer()

  const { data: withdrawal, error } = await db
    .from('org_withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .single()

  if (error || !withdrawal) return null

  // Get items
  const { data: items } = await db
    .from('org_withdrawal_items')
    .select('*')
    .eq('withdrawal_id', withdrawalId)
    .order('sort_order', { ascending: true })

  // Get org name
  const { data: org } = await db
    .from('organizations')
    .select('name')
    .eq('id', withdrawal.org_id)
    .single()

  // Get bank account details if linked
  let bankAccount = null
  if (withdrawal.bank_account_id) {
    const { data: ba } = await db
      .from('bank_accounts')
      .select('bik, bank_name, settlement_account')
      .eq('id', withdrawal.bank_account_id)
      .single()
    bankAccount = ba
  }

  return {
    ...withdrawal,
    items: (items || []) as WithdrawalItem[],
    org_name: org?.name,
    bank_account: bankAccount,
  } as WithdrawalWithItems
}

/**
 * List withdrawals with filters (for org owner or superadmin).
 */
export async function getWithdrawals(
  filters: WithdrawalFilter = {}
): Promise<{ withdrawals: OrgWithdrawal[]; total: number }> {
  const db = createAdminServer()

  const page = filters.page || 1
  const pageSize = filters.pageSize || 20
  const offset = (page - 1) * pageSize

  const conditions: string[] = []
  const params: any[] = []
  let paramIdx = 1

  if (filters.orgId) {
    conditions.push(`w.org_id = $${paramIdx}`)
    params.push(filters.orgId)
    paramIdx++
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(`w.status = ANY($${paramIdx})`)
      params.push(filters.status)
    } else {
      conditions.push(`w.status = $${paramIdx}`)
      params.push(filters.status)
    }
    paramIdx++
  }

  if (filters.dateFrom) {
    conditions.push(`w.requested_at >= $${paramIdx}`)
    params.push(filters.dateFrom)
    paramIdx++
  }

  if (filters.dateTo) {
    conditions.push(`w.requested_at <= $${paramIdx}`)
    params.push(filters.dateTo)
    paramIdx++
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  // Count
  const { data: countData } = await db.raw(
    `SELECT COUNT(*)::int AS total FROM org_withdrawals w ${where}`,
    params
  )
  const total = countData?.[0]?.total ?? 0

  // Fetch with org name
  const { data: withdrawals, error } = await db.raw(
    `SELECT w.*, o.name AS org_name
     FROM org_withdrawals w
     LEFT JOIN organizations o ON o.id = w.org_id
     ${where}
     ORDER BY w.requested_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  )

  if (error) {
    logger.error({ error: error.message, filters }, 'Failed to list withdrawals')
    return { withdrawals: [], total: 0 }
  }

  return {
    withdrawals: (withdrawals || []) as OrgWithdrawal[],
    total,
  }
}

// ─── Withdrawal Request Document ────────────────────────────────────

/**
 * Generates the «Требование на вывод средств» (см. п. 1.12 / 5.4 агентского
 * договора) — распоряжение Принципала о перечислении доступного остатка
 * с Баланса Организатора. Это **не акт оказанных услуг**: агентское
 * вознаграждение Орбо фиксируется отдельно ежемесячным актом АВ-N.
 *
 * В документе:
 *   • реквизиты Принципала (контрагент по агентскому договору) и Агента (Орбо);
 *   • ссылка на договор;
 *   • обобщённый реестр оплат-источников выплачиваемой суммы (без раскрытия
 *     удержанной агентской комиссии — она к этому документу не относится);
 *   • итоговая сумма к перечислению на банковский счёт Принципала.
 *
 * Сохраняется в S3, URL пишется в org_withdrawals.act_document_url.
 * Имя поля историческое — это просто строка-идентификатор документа.
 */
export async function generateWithdrawalAct(withdrawalId: string): Promise<string> {
  const db = createAdminServer()

  const withdrawal = await getWithdrawalById(withdrawalId)
  if (!withdrawal) {
    throw new Error('Withdrawal not found')
  }

  // Подтягиваем контрагента + номер агентского договора. Берём по
  // contract_id заявки, если он привязан, иначе — последний signed-договор
  // организации на дату запроса (та же логика, что и в реестрах).
  const { data: contractRows } = await db.raw(
    `SELECT c.contract_number, c.contract_date,
            cps.type, cps.inn, cps.kpp, cps.ogrn,
            cps.org_name, cps.full_name, cps.legal_address
       FROM org_withdrawals w
       LEFT JOIN contracts c
         ON c.id = COALESCE(
           w.contract_id,
           (SELECT id FROM contracts c2
              WHERE c2.org_id = w.org_id AND c2.status = 'signed'
                AND c2.contract_date <= w.requested_at::date
              ORDER BY c2.contract_date DESC LIMIT 1)
         )
       LEFT JOIN counterparties cps ON cps.id = c.counterparty_id
      WHERE w.id = $1
      LIMIT 1`,
    [withdrawalId]
  )
  const contract = (contractRows && contractRows[0]) || null

  const html = buildWithdrawalRequestHtml(withdrawal, contract as ContractCounterpartyRow | null)

  const { createStorage, getBucket, getStoragePath } = await import('@/lib/storage')
  const storage = createStorage()
  const localPath = `withdrawals/${withdrawal.org_id}/${withdrawal.act_number.replace(/[^a-zA-Z0-9а-яА-ЯёЁ-]/g, '_')}.html`
  const bucket = getBucket('documents')
  const storagePath = getStoragePath('documents', localPath)

  await storage.upload(bucket, storagePath, Buffer.from(html, 'utf-8'), {
    contentType: 'text/html; charset=utf-8',
  })

  const url = storage.getPublicUrl(bucket, storagePath)

  await db
    .from('org_withdrawals')
    .update({ act_document_url: url })
    .eq('id', withdrawalId)

  logger.info({ withdrawal_id: withdrawalId, request_number: withdrawal.act_number, url }, 'Withdrawal request document generated')
  return url
}

interface ContractCounterpartyRow {
  contract_number: string | null
  contract_date: string | null
  type: 'individual' | 'legal_entity' | null
  inn: string | null
  kpp: string | null
  ogrn: string | null
  org_name: string | null
  full_name: string | null
  legal_address: string | null
}

function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildWithdrawalRequestHtml(
  withdrawal: WithdrawalWithItems,
  contract: ContractCounterpartyRow | null
): string {
  const formatMoney = (v: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('ru-RU') : '—'

  const principalName = contract?.type === 'individual'
    ? (contract.full_name || withdrawal.org_name || '—')
    : (contract?.org_name || withdrawal.org_name || '—')
  const principalLegalForm = contract?.type === 'legal_entity'
    ? 'Юридическое лицо / ИП'
    : contract?.type === 'individual' ? 'Физическое лицо' : ''

  const principalReqLines: string[] = []
  if (contract?.inn) principalReqLines.push(`ИНН ${escapeHtml(contract.inn)}`)
  if (contract?.kpp) principalReqLines.push(`КПП ${escapeHtml(contract.kpp)}`)
  if (contract?.ogrn) principalReqLines.push(`ОГРН ${escapeHtml(contract.ogrn)}`)
  if (contract?.legal_address) principalReqLines.push(escapeHtml(contract.legal_address))

  const ba = withdrawal.bank_account
  const bankLines: string[] = []
  if (ba?.bank_name) bankLines.push(`Банк: ${escapeHtml(ba.bank_name)}`)
  if (ba?.bik) bankLines.push(`БИК: ${escapeHtml(ba.bik)}`)
  if (ba?.settlement_account) bankLines.push(`Расчётный счёт: ${escapeHtml(ba.settlement_account)}`)

  // Обобщённый реестр оплат-источников: одна строка на событие, без отдельного
  // столбца агентской комиссии. Если items нет — рисуем пустое примечание.
  // Колонка «Сумма к перечислению» = item.total (post-commission, как уже
  // сохранено при формировании заявки — комиссия не выделяется).
  const itemRows = (withdrawal.items || []).map((item, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(item.event_name || item.description || '—')}</td>
      <td class="center">${item.participant_count != null ? item.participant_count : '—'}</td>
      <td class="amount">${formatMoney(item.total)} ₽</td>
    </tr>
  `).join('')

  const docDate = formatDate(withdrawal.requested_at)
  const periodLabel = withdrawal.period_from && withdrawal.period_to
    ? `${formatDate(withdrawal.period_from)} — ${formatDate(withdrawal.period_to)}`
    : '—'
  const contractRef = contract?.contract_number
    ? `на основании Агентского договора № ${escapeHtml(contract.contract_number)} от ${formatDate(contract.contract_date)}`
    : 'на основании заключённого Агентского договора-оферты'

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Требование на вывод средств № ${escapeHtml(withdrawal.act_number)}</title>
  <style>
    @page { size: A4; margin: 1.5cm; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.4; color: #000; max-width: 190mm; margin: 0 auto; padding: 12px; }
    h1 { text-align: center; font-size: 14pt; margin: 0 0 2px; text-transform: uppercase; }
    .subtitle { text-align: center; font-size: 11pt; font-style: italic; margin-bottom: 18px; }
    .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; font-size: 11pt; }
    .parties { margin: 12px 0 16px; font-size: 11pt; }
    .parties .party { margin-bottom: 6px; }
    .parties .party-title { font-weight: bold; }
    .preamble { margin: 14px 0; font-size: 11pt; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10.5pt; }
    th, td { border: 1px solid #000; padding: 5px 6px; vertical-align: top; }
    th { background: #f0f0f0; font-size: 10pt; }
    .center { text-align: center; }
    .amount { text-align: right; white-space: nowrap; }
    .total-row td { font-weight: bold; background: #fafafa; }
    .bank { margin: 16px 0; padding: 10px 12px; background: #f7f7f7; border-left: 3px solid #888; font-size: 10.5pt; }
    .bank-title { font-weight: bold; margin-bottom: 4px; }
    .signature { margin-top: 36px; }
    .signature-line { border-bottom: 1px solid #000; height: 30px; margin: 14px 0 4px; width: 60%; }
    .signature-caption { font-size: 9.5pt; color: #555; }
    .footnote { margin-top: 24px; font-size: 9.5pt; color: #666; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Требование на вывод средств № ${escapeHtml(withdrawal.act_number)}</h1>
  <p class="subtitle">распоряжение Принципала о перечислении средств (п. 5.4 Агентского договора)</p>

  <div class="meta">
    <div><strong>Дата:</strong> ${docDate}</div>
    <div><strong>Период расчётов:</strong> ${periodLabel}</div>
  </div>

  <div class="parties">
    <div class="party">
      <span class="party-title">Принципал:</span> ${escapeHtml(principalName)}${principalLegalForm ? ` (${principalLegalForm})` : ''}.
      ${principalReqLines.length > 0 ? `<br>${principalReqLines.join(', ')}.` : ''}
    </div>
    <div class="party">
      <span class="party-title">Агент:</span> ${escapeHtml(ORBO_ENTITY.fullName)}, ИНН ${ORBO_ENTITY.inn}, КПП ${ORBO_ENTITY.kpp}, ОГРН ${ORBO_ENTITY.ogrn}, адрес: ${escapeHtml(ORBO_ENTITY.legalAddress)}.
    </div>
  </div>

  <p class="preamble">
    Принципал ${contractRef} требует от Агента перечислить с Баланса Организатора
    сумму <strong>${formatMoney(withdrawal.net_amount)} ${escapeHtml(withdrawal.currency || 'RUB')}</strong>
    на банковские реквизиты, указанные ниже, в срок, установленный п. 5.5 Агентского договора
    (5 рабочих дней с даты надлежащего оформления настоящего Требования).
  </p>

  ${withdrawal.items && withdrawal.items.length > 0 ? `
  <p style="margin: 14px 0 6px; font-size: 11pt;"><strong>Обобщённый реестр выплачиваемых средств по событиям:</strong></p>
  <table>
    <thead>
      <tr>
        <th style="width: 40px;">№</th>
        <th>Событие / основание</th>
        <th style="width: 110px;" class="center">Участников</th>
        <th style="width: 160px;">К перечислению, ₽</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="total-row">
        <td colspan="3">Итого к перечислению</td>
        <td class="amount">${formatMoney(withdrawal.net_amount)} ₽</td>
      </tr>
    </tbody>
  </table>
  ` : `
  <p style="margin: 14px 0; font-size: 11pt;">
    <strong>Сумма к перечислению:</strong> ${formatMoney(withdrawal.net_amount)} ₽
    <br>
    <span style="color: #666; font-size: 10pt;">Детализация по событиям отсутствует — выплата сформирована по сводному остатку Баланса Организатора.</span>
  </p>
  `}

  <div class="bank">
    <div class="bank-title">Реквизиты для перечисления:</div>
    ${bankLines.length > 0 ? bankLines.map(l => `<div>${l}</div>`).join('') : '<div>Реквизиты не указаны — будут уточнены до перечисления.</div>'}
    <div style="margin-top: 6px;">Получатель: ${escapeHtml(principalName)}.</div>
  </div>

  <div class="signature">
    <p><strong>От Принципала:</strong></p>
    <div class="signature-line"></div>
    <div class="signature-caption">подпись / Ф.И.О. уполномоченного лица</div>
  </div>

  <p class="footnote">
    Документ сформирован автоматически в личном кабинете платформы Orbo на основании
    запроса Принципала. Агентское вознаграждение Агента (Orbo) удерживается в безакцептном порядке
    в соответствии с п. 6.3 Агентского договора и оформляется отдельным актом (АВ-N) ежемесячно;
    в настоящем Требовании отражается только сумма к перечислению Принципалу.
  </p>
</body>
</html>`
}
