/**
 * Organization Account Service
 * Manages internal financial accounts, transaction ledger, and balance queries.
 *
 * Key principle: org_transactions is the single source of truth.
 * Balance = latest row's balance_after (computed atomically by PostgreSQL RPC).
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('OrgAccountService')

// ─── Types ──────────────────────────────────────────────────────────

export interface OrgAccount {
  id: string
  org_id: string
  commission_rate: number
  min_withdrawal_amount: number
  currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type TransactionType =
  | 'payment_incoming'
  | 'commission_deduction'
  | 'withdrawal_requested'
  | 'withdrawal_completed'
  | 'withdrawal_rejected'
  | 'refund'
  | 'commission_reversal'
  | 'adjustment'

export interface OrgTransaction {
  id: string
  org_id: string
  type: TransactionType
  amount: number
  currency: string
  balance_after: number
  event_registration_id: string | null
  membership_payment_id: string | null
  withdrawal_id: string | null
  participant_id: string | null
  event_id: string | null
  payment_gateway: string | null
  external_payment_id: string | null
  idempotency_key: string | null
  description: string | null
  metadata: Record<string, any>
  created_by: string | null
  created_at: string
}

export interface RecordPaymentParams {
  orgId: string
  amount: number
  currency?: string
  eventRegistrationId?: string
  membershipPaymentId?: string
  eventId?: string
  participantId?: string
  paymentGateway?: string
  externalPaymentId?: string
  description?: string
  createdBy?: string
}

export interface RecordPaymentResult {
  paymentTransactionId: string
  commissionTransactionId: string
  commissionAmount: number
  netAmount: number
  newBalance: number
}

export interface TransactionFilter {
  type?: TransactionType | TransactionType[]
  eventId?: string
  participantId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface FinancialSummary {
  balance: number
  totalIncome: number
  totalCommission: number
  totalWithdrawn: number
  totalRefunded: number
  transactionCount: number
}

// ─── Account Management ─────────────────────────────────────────────

/**
 * Get or create org account. Returns account config (not balance).
 */
export async function getOrCreateOrgAccount(orgId: string): Promise<OrgAccount> {
  const db = createAdminServer()

  // Try to get existing
  const { data: existing } = await db
    .from('org_accounts')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (existing) return existing as OrgAccount

  // Create new
  const { data: created, error } = await db
    .from('org_accounts')
    .insert({ org_id: orgId })
    .select('*')
    .single()

  if (error) {
    // Race condition: another request created it
    const { data: retry } = await db
      .from('org_accounts')
      .select('*')
      .eq('org_id', orgId)
      .single()
    if (retry) return retry as OrgAccount
    logger.error({ org_id: orgId, error: error.message }, 'Failed to create org account')
    throw new Error('Failed to create org account')
  }

  logger.info({ org_id: orgId }, 'Org account created')
  return created as OrgAccount
}

/**
 * Get current balance for an org.
 */
export async function getOrgBalance(orgId: string): Promise<number> {
  const db = createAdminServer()

  const { data } = await db
    .from('org_transactions')
    .select('balance_after')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.balance_after ?? 0
}

// ─── Recording Payments ─────────────────────────────────────────────

/**
 * Record an incoming payment (event or membership).
 * Creates two ledger entries atomically: payment + commission.
 */
export async function recordIncomingPayment(
  params: RecordPaymentParams
): Promise<RecordPaymentResult> {
  const db = createAdminServer()

  // Build idempotency key
  let idempotencyKey: string | null = null
  if (params.eventRegistrationId) {
    idempotencyKey = `evt_reg_${params.eventRegistrationId}`
  } else if (params.membershipPaymentId) {
    idempotencyKey = `mbr_pay_${params.membershipPaymentId}`
  }

  const { data, error } = await db.raw(
    `SELECT * FROM record_incoming_payment($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      params.orgId,
      params.amount,
      params.currency || 'RUB',
      idempotencyKey,
      params.eventRegistrationId || null,
      params.membershipPaymentId || null,
      params.eventId || null,
      params.participantId || null,
      params.paymentGateway || 'manual',
      params.externalPaymentId || null,
      params.description || null,
      params.createdBy || null,
    ]
  )

  if (error) {
    // Idempotency: if duplicate key, just return existing data
    if (error.message?.includes('unique') || error.code === '23505') {
      logger.warn({ idempotency_key: idempotencyKey }, 'Duplicate payment recording attempt, skipping')
      const balance = await getOrgBalance(params.orgId)
      return {
        paymentTransactionId: '',
        commissionTransactionId: '',
        commissionAmount: 0,
        netAmount: params.amount,
        newBalance: balance,
      }
    }
    logger.error({ org_id: params.orgId, error: error.message, params }, 'Failed to record incoming payment')
    throw new Error(`Failed to record payment: ${error.message}`)
  }

  const row = data?.[0]
  if (!row) {
    throw new Error('No result from record_incoming_payment')
  }

  logger.info({
    org_id: params.orgId,
    amount: params.amount,
    commission: row.commission_amount,
    net: row.net_amount,
    balance: row.new_balance,
    event_registration_id: params.eventRegistrationId,
    membership_payment_id: params.membershipPaymentId,
  }, 'Incoming payment recorded')

  return {
    paymentTransactionId: row.payment_transaction_id,
    commissionTransactionId: row.commission_transaction_id,
    commissionAmount: parseFloat(row.commission_amount),
    netAmount: parseFloat(row.net_amount),
    newBalance: parseFloat(row.new_balance),
  }
}

/**
 * Convenience: record event payment.
 */
export async function recordEventPayment(params: {
  orgId: string
  eventId: string
  eventRegistrationId: string
  participantId: string
  amount: number
  currency?: string
  paymentGateway?: string
  externalPaymentId?: string
  confirmedBy?: string
}): Promise<RecordPaymentResult> {
  return recordIncomingPayment({
    orgId: params.orgId,
    amount: params.amount,
    currency: params.currency,
    eventRegistrationId: params.eventRegistrationId,
    eventId: params.eventId,
    participantId: params.participantId,
    paymentGateway: params.paymentGateway,
    externalPaymentId: params.externalPaymentId,
    description: 'Оплата участия в мероприятии',
    createdBy: params.confirmedBy,
  })
}

/**
 * Convenience: record membership payment.
 */
export async function recordMembershipPayment(params: {
  orgId: string
  membershipPaymentId: string
  participantId?: string
  amount: number
  currency?: string
  paymentGateway?: string
  confirmedBy?: string
}): Promise<RecordPaymentResult> {
  return recordIncomingPayment({
    orgId: params.orgId,
    amount: params.amount,
    currency: params.currency,
    membershipPaymentId: params.membershipPaymentId,
    participantId: params.participantId,
    paymentGateway: params.paymentGateway,
    description: 'Оплата членства',
    createdBy: params.confirmedBy,
  })
}

// ─── Transaction History ────────────────────────────────────────────

/**
 * Get paginated transaction history for an org.
 */
export async function getTransactionHistory(
  orgId: string,
  filters: TransactionFilter = {}
): Promise<{ transactions: OrgTransaction[]; total: number }> {
  const db = createAdminServer()
  const page = filters.page || 1
  const pageSize = filters.pageSize || 50
  const offset = (page - 1) * pageSize

  // Build WHERE conditions
  const conditions: string[] = ['org_id = $1']
  const params: any[] = [orgId]
  let paramIdx = 2

  if (filters.type) {
    if (Array.isArray(filters.type)) {
      conditions.push(`type = ANY($${paramIdx})`)
      params.push(filters.type)
    } else {
      conditions.push(`type = $${paramIdx}`)
      params.push(filters.type)
    }
    paramIdx++
  }

  if (filters.eventId) {
    conditions.push(`event_id = $${paramIdx}`)
    params.push(filters.eventId)
    paramIdx++
  }

  if (filters.participantId) {
    conditions.push(`participant_id = $${paramIdx}`)
    params.push(filters.participantId)
    paramIdx++
  }

  if (filters.dateFrom) {
    conditions.push(`created_at >= $${paramIdx}`)
    params.push(filters.dateFrom)
    paramIdx++
  }

  if (filters.dateTo) {
    conditions.push(`created_at <= $${paramIdx}`)
    params.push(filters.dateTo)
    paramIdx++
  }

  const where = conditions.join(' AND ')

  // Count total
  const { data: countData } = await db.raw(
    `SELECT COUNT(*)::int AS total FROM org_transactions WHERE ${where}`,
    params
  )
  const total = countData?.[0]?.total ?? 0

  // Fetch page
  const { data: transactions, error } = await db.raw(
    `SELECT * FROM org_transactions WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  )

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch transactions')
    return { transactions: [], total: 0 }
  }

  return {
    transactions: (transactions || []) as OrgTransaction[],
    total,
  }
}

// ─── Financial Summary ──────────────────────────────────────────────

/**
 * Get aggregated financial summary for an org.
 */
export async function getOrgFinancialSummary(
  orgId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<FinancialSummary> {
  const db = createAdminServer()

  const conditions: string[] = ['org_id = $1']
  const params: any[] = [orgId]
  let paramIdx = 2

  if (dateFrom) {
    conditions.push(`created_at >= $${paramIdx}`)
    params.push(dateFrom)
    paramIdx++
  }

  if (dateTo) {
    conditions.push(`created_at <= $${paramIdx}`)
    params.push(dateTo)
    paramIdx++
  }

  const where = conditions.join(' AND ')

  const { data, error } = await db.raw(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'payment_incoming' THEN amount ELSE 0 END), 0) AS total_income,
       COALESCE(SUM(CASE WHEN type = 'commission_deduction' THEN ABS(amount) ELSE 0 END), 0) AS total_commission,
       COALESCE(SUM(CASE WHEN type = 'withdrawal_completed' THEN ABS(amount) ELSE 0 END), 0) AS total_withdrawn,
       COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(amount) ELSE 0 END), 0) AS total_refunded,
       COUNT(*)::int AS transaction_count
     FROM org_transactions
     WHERE ${where}`,
    params
  )

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch financial summary')
    return {
      balance: 0,
      totalIncome: 0,
      totalCommission: 0,
      totalWithdrawn: 0,
      totalRefunded: 0,
      transactionCount: 0,
    }
  }

  const row = data?.[0]
  const balance = await getOrgBalance(orgId)

  return {
    balance,
    totalIncome: parseFloat(row?.total_income ?? 0),
    totalCommission: parseFloat(row?.total_commission ?? 0),
    totalWithdrawn: parseFloat(row?.total_withdrawn ?? 0),
    totalRefunded: parseFloat(row?.total_refunded ?? 0),
    transactionCount: row?.transaction_count ?? 0,
  }
}

// ─── Account Updates ────────────────────────────────────────────────

/**
 * Update org account settings (superadmin).
 */
export async function updateOrgAccount(
  orgId: string,
  updates: {
    commission_rate?: number
    min_withdrawal_amount?: number
    is_active?: boolean
  }
): Promise<OrgAccount | null> {
  const db = createAdminServer()

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  if (updates.commission_rate !== undefined) updateData.commission_rate = updates.commission_rate
  if (updates.min_withdrawal_amount !== undefined) updateData.min_withdrawal_amount = updates.min_withdrawal_amount
  if (updates.is_active !== undefined) updateData.is_active = updates.is_active

  const { data, error } = await db
    .from('org_accounts')
    .update(updateData)
    .eq('org_id', orgId)
    .select('*')
    .single()

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to update org account')
    return null
  }

  logger.info({ org_id: orgId, updates }, 'Org account updated')
  return data as OrgAccount
}
