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

  // Check for active contract
  if (params.contractId) {
    const { data: contract } = await db
      .from('contracts')
      .select('id, status')
      .eq('id', params.contractId)
      .eq('org_id', params.orgId)
      .single()

    if (!contract || contract.status !== 'signed') {
      throw new Error('Contract must be in signed status for withdrawal')
    }
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

// ─── Act Generation ─────────────────────────────────────────────────

/**
 * Generate a withdrawal act document (simple HTML for now, can be extended to PDF).
 * Uploads to S3 and saves URL to withdrawal record.
 */
export async function generateWithdrawalAct(withdrawalId: string): Promise<string> {
  const db = createAdminServer()

  const withdrawal = await getWithdrawalById(withdrawalId)
  if (!withdrawal) {
    throw new Error('Withdrawal not found')
  }

  // Build act HTML
  const html = buildActHtml(withdrawal)

  // Upload to S3
  const { createStorage, getBucket, getStoragePath } = await import('@/lib/storage')
  const storage = createStorage()
  const localPath = `withdrawals/${withdrawal.org_id}/${withdrawal.act_number.replace(/[^a-zA-Z0-9а-яА-ЯёЁ-]/g, '_')}.html`
  const bucket = getBucket('documents')
  const storagePath = getStoragePath('documents', localPath)

  await storage.upload(bucket, storagePath, Buffer.from(html, 'utf-8'), {
    contentType: 'text/html; charset=utf-8',
  })

  const url = storage.getPublicUrl(bucket, storagePath)

  // Save URL
  await db
    .from('org_withdrawals')
    .update({ act_document_url: url })
    .eq('id', withdrawalId)

  logger.info({ withdrawal_id: withdrawalId, act_number: withdrawal.act_number, url }, 'Act generated')
  return url
}

/**
 * Build act HTML content.
 */
function buildActHtml(withdrawal: WithdrawalWithItems): string {
  const formatMoney = (v: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 }).format(v)
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('ru-RU') : '—'

  const itemRows = withdrawal.items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.description}</td>
      <td>${item.quantity}</td>
      <td>${formatMoney(item.amount)} ₽</td>
      <td>${formatMoney(item.total)} ₽</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Акт ${withdrawal.act_number}</title>
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 14px; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { text-align: center; font-size: 18px; }
    .meta { margin: 20px 0; }
    .meta p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #000; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; }
    .totals { margin-top: 20px; }
    .totals p { margin: 4px 0; }
    .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
    .sig-block { width: 45%; }
    .sig-line { border-bottom: 1px solid #000; height: 30px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>АКТ ${withdrawal.act_number}</h1>
  <p style="text-align:center;">оказанных услуг</p>

  <div class="meta">
    <p><strong>Дата:</strong> ${formatDate(withdrawal.completed_at || withdrawal.requested_at)}</p>
    <p><strong>Организация:</strong> ${withdrawal.org_name || '—'}</p>
    <p><strong>Период:</strong> ${formatDate(withdrawal.period_from)} — ${formatDate(withdrawal.period_to)}</p>
  </div>

  ${withdrawal.items.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Описание</th>
        <th>Кол-во</th>
        <th>Цена</th>
        <th>Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>
  ` : ''}

  <div class="totals">
    <p><strong>Итого:</strong> ${formatMoney(withdrawal.amount)} ₽</p>
    <p><strong>Комиссия платформы:</strong> ${formatMoney(withdrawal.commission_amount)} ₽</p>
    <p><strong>К выплате:</strong> ${formatMoney(withdrawal.net_amount)} ₽</p>
  </div>

  <div class="signatures">
    <div class="sig-block">
      <p><strong>Исполнитель:</strong></p>
      <div class="sig-line"></div>
    </div>
    <div class="sig-block">
      <p><strong>Заказчик:</strong></p>
      <div class="sig-line"></div>
    </div>
  </div>
</body>
</html>`
}
