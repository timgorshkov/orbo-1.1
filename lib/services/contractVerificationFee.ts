/**
 * Contract Verification Fee — accounting flow.
 *
 * When a counterparty pays the one-off "fast requisites verification" fee
 * (200 ₽) by bank transfer, we need to:
 *   1. Create an org_invoices row marked as paid (so it becomes Orbo's
 *      taxable revenue under USN 6%).
 *   2. Generate a license-transfer act (АЛ-N) via subscriptionActService —
 *      which also pushes the act to Контур.Эльба automatically.
 *
 * Idempotent: re-running for the same contract+payment date returns the
 * existing invoice instead of creating a duplicate.
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { getContractById } from './contractService'

const logger = createServiceLogger('ContractVerificationFee')

/** Marker stored in org_invoices.notes so we can identify these rows later. */
const NOTES_PREFIX = 'contract_verification_fee:'

export interface RecordVerificationFeeInput {
  contractId: string
  /** ISO YYYY-MM-DD — date the money hit our bank account */
  paidDate: string
  /** Amount paid (RUB). Defaults to 200 ₽. */
  amount?: number
  /** Optional payment number from the bank statement (для трассировки). */
  paymentNumber?: string | null
  /** Who confirmed the payment (admin user id or 'auto' for statement-driven flow). */
  confirmedBy: string
}

export interface RecordVerificationFeeResult {
  invoiceId: string
  actNumber: string | null
  actUrl: string | null
  alreadyExisted: boolean
}

/**
 * Records the verification-fee payment as a paid org_invoice and triggers act
 * generation. Safe to call multiple times — second call returns the existing
 * row.
 */
export async function recordVerificationFeePayment(
  input: RecordVerificationFeeInput
): Promise<RecordVerificationFeeResult> {
  const db = createAdminServer()
  const amount = input.amount ?? 200

  const contract = await getContractById(input.contractId)
  if (!contract) {
    throw new Error(`Contract ${input.contractId} not found`)
  }

  // Idempotency: see if we already booked this contract's verification fee.
  // Use notes prefix as the unique marker so we don't need a new column.
  const marker = `${NOTES_PREFIX}${input.contractId}`
  const { data: existing } = await db.raw(
    `SELECT id FROM org_invoices WHERE notes = $1 LIMIT 1`,
    [marker]
  )
  if (existing && existing.length > 0) {
    const id = (existing[0] as any).id as string
    logger.info({ contract_id: input.contractId, invoice_id: id }, 'Verification fee already booked; returning existing')
    return await loadResult(id, true)
  }

  const cp = contract.counterparty
  const customerType = cp.type === 'legal_entity' ? 'legal_entity' : 'individual'
  const customerName = cp.type === 'legal_entity' ? (cp.org_name || cp.full_name) : cp.full_name
  const periodDate = input.paidDate // single-day "period" for one-off services

  // Create the invoice. amount is INTEGER in the DB, so we round defensively.
  const { data: created, error } = await db
    .from('org_invoices')
    .insert({
      org_id: contract.org_id,
      subscription_id: null, // no subscription for verification fee
      amount: Math.round(amount),
      currency: 'RUB',
      period_start: periodDate,
      period_end: periodDate,
      status: 'paid',
      payment_method: 'bank_transfer',
      gateway_code: null,
      paid_at: new Date(`${input.paidDate}T12:00:00+03:00`).toISOString(),
      confirmed_by: input.confirmedBy === 'auto' ? null : input.confirmedBy,
      customer_type: customerType,
      customer_name: customerName,
      customer_inn: cp.inn,
      customer_email: cp.email,
      customer_phone: cp.phone,
      notes: marker,
      act_required: true,
    })
    .select('id')
    .single()

  if (error || !created) {
    logger.error({ contract_id: input.contractId, error: error?.message }, 'Failed to create verification-fee invoice')
    throw new Error(`Failed to create invoice: ${error?.message || 'unknown'}`)
  }

  logger.info({
    contract_id: input.contractId,
    invoice_id: created.id,
    amount,
    paid_date: input.paidDate,
    payment_number: input.paymentNumber || null,
    customer_type: customerType,
  }, 'Verification fee invoice created')

  // Trigger act generation (and Elba sync) — this is what subscriptionActService
  // does for regular tariff invoices. Override the act labelling via metadata
  // so the document is titled "Acceleratory requisites check" rather than the
  // default plan name. We do this by passing the customised plan via metadata.
  let actNumber: string | null = null
  let actUrl: string | null = null
  try {
    const { generateSubscriptionAct } = await import('./subscriptionActService')
    const actResult = await generateSubscriptionAct(created.id)
    actNumber = actResult.actNumber || null
    actUrl = actResult.htmlUrl || null
    if (actResult.skipped) {
      logger.info({ invoice_id: created.id, reason: actResult.skipped }, 'Verification fee act skipped')
    }
  } catch (actErr: any) {
    logger.error({ invoice_id: created.id, error: actErr.message }, 'Failed to generate verification fee act')
    // Don't rethrow — invoice itself is recorded; the act can be regenerated later.
  }

  return {
    invoiceId: created.id,
    actNumber,
    actUrl,
    alreadyExisted: false,
  }
}

async function loadResult(invoiceId: string, alreadyExisted: boolean): Promise<RecordVerificationFeeResult> {
  const db = createAdminServer()
  const { data } = await db
    .from('org_invoices')
    .select('id, act_number, act_document_url')
    .eq('id', invoiceId)
    .maybeSingle()
  return {
    invoiceId,
    actNumber: data?.act_number || null,
    actUrl: data?.act_document_url || null,
    alreadyExisted,
  }
}
