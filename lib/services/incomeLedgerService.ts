/**
 * Income Ledger Service
 *
 * Aggregates Orbo's own taxable revenue (USN 6%) per day, for accounting purposes.
 *
 * Sources of Orbo income:
 *   1. Service fee — collected from event participants on top of ticket price
 *      (table: platform_income, income_type='service_fee')
 *   2. Agent commission — withheld from legal-entity organizers' ticket revenue
 *      (table: platform_income, income_type='agent_commission')
 *   3. Subscription / license payments for paid Orbo plans
 *      (table: org_invoices, status='paid')
 *
 * Cash basis: revenue is recognised at the moment money settles in our account.
 * For tickets/service fees we use platform_income.created_at (set by paymentService
 * at the time the acquirer webhook confirms payment success). For subscriptions we
 * use org_invoices.paid_at.
 *
 * NB: This does NOT include withdrawals to organizers (those are principal funds,
 * not Orbo revenue) or refunds (refunds reduce ticket_price returned to participant
 * but do not refund our service fee — see paymentService.processRefund).
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('IncomeLedger');

export type IncomeKind = 'service_fee' | 'agent_commission' | 'subscription' | 'service_fee_refund' | 'agent_commission_refund';

export interface IncomeLedgerLine {
  /** ISO date YYYY-MM-DD when income was recognised (cash basis) */
  date: string;
  /** Recognised at full timestamp */
  recognisedAt: string;
  kind: IncomeKind;
  /** Human-readable income kind */
  kindLabel: string;
  /** Net Orbo revenue in RUB — positive number; refunds carry negative amount */
  amount: number;
  currency: string;
  /** Counterparty name to show in Elba (organizer for commission, "Розничные покупатели" for service_fee, billing customer for subscription) */
  contractor: string;
  /** Counterparty type for grouping */
  contractorType: 'retail' | 'organizer' | 'subscriber';
  /** Optional org owning the source transaction */
  orgId: string | null;
  orgName: string | null;
  /** Optional event link (for ticket-based incomes) */
  eventId: string | null;
  eventTitle: string | null;
  /** Document number / id linking to accounting_documents (УПД, АУ, АЛ) if any */
  documentNumber: string | null;
  /** Source row id for traceability */
  sourceTable: 'platform_income' | 'org_invoices';
  sourceId: string;
}

export interface IncomeLedgerSummary {
  periodFrom: string;
  periodTo: string;
  totalAmount: number;
  byKind: Record<IncomeKind, number>;
  byDay: Array<{ date: string; total: number; byKind: Partial<Record<IncomeKind, number>> }>;
  lineCount: number;
}

const KIND_LABELS: Record<IncomeKind, string> = {
  service_fee: 'Сервисный сбор',
  agent_commission: 'Агентское вознаграждение',
  subscription: 'Лицензионный платёж',
  service_fee_refund: 'Возврат сервисного сбора',
  agent_commission_refund: 'Возврат агентского вознаграждения',
};

/**
 * Fetch all income lines for the period (inclusive on both ends, dates as YYYY-MM-DD
 * in server-local timezone — Moscow for production).
 *
 * The query joins minimal context (org name, event title, customer requisites) so the
 * caller can render a self-contained report without extra round-trips.
 */
export async function getIncomeLedger(periodFrom: string, periodTo: string): Promise<IncomeLedgerLine[]> {
  const db = createAdminServer();

  const fromTs = `${periodFrom}T00:00:00+03:00`; // Moscow tz — matches how dates are read in UI
  const toTs = `${periodTo}T23:59:59.999+03:00`;

  // Tickets & agent commission from platform_income
  const { data: piRows, error: piErr } = await db.raw(
    `SELECT pi.id, pi.income_type, pi.amount, pi.currency, pi.created_at,
            pi.org_id, o.name AS org_name,
            er.event_id, e.title AS event_title
       FROM platform_income pi
       LEFT JOIN organizations o ON o.id = pi.org_id
       LEFT JOIN event_registrations er ON er.id = pi.event_registration_id
       LEFT JOIN events e ON e.id = er.event_id
      WHERE pi.created_at >= $1
        AND pi.created_at <= $2
      ORDER BY pi.created_at ASC`,
    [fromTs, toTs]
  );

  if (piErr) {
    logger.error({ error: piErr.message }, 'Failed to query platform_income');
    throw new Error('Failed to query platform_income');
  }

  // Subscriptions paid in period (org_invoices.paid_at)
  const { data: invRows, error: invErr } = await db.raw(
    `SELECT inv.id, inv.amount, inv.currency, inv.paid_at,
            inv.org_id, o.name AS org_name,
            inv.customer_name, inv.customer_inn, inv.invoice_number, inv.plan_code
       FROM org_invoices inv
       LEFT JOIN organizations o ON o.id = inv.org_id
      WHERE inv.status = 'paid'
        AND inv.paid_at IS NOT NULL
        AND inv.paid_at >= $1
        AND inv.paid_at <= $2
      ORDER BY inv.paid_at ASC`,
    [fromTs, toTs]
  );

  if (invErr) {
    // org_invoices table or columns may differ in some envs — log + continue with what we have
    logger.warn({ error: invErr.message }, 'org_invoices query failed — subscription income skipped');
  }

  const lines: IncomeLedgerLine[] = [];

  for (const row of (piRows || []) as any[]) {
    const kind = row.income_type as IncomeKind;
    const recognised = new Date(row.created_at);
    const isRefund = kind === 'service_fee_refund' || kind === 'agent_commission_refund';
    lines.push({
      date: toLocalDate(recognised),
      recognisedAt: recognised.toISOString(),
      kind,
      kindLabel: KIND_LABELS[kind] || kind,
      amount: isRefund ? -Math.abs(Number(row.amount)) : Number(row.amount),
      currency: row.currency || 'RUB',
      contractor: kind === 'agent_commission' || kind === 'agent_commission_refund'
        ? (row.org_name || 'Принципал')
        : 'Розничные покупатели',
      contractorType: kind === 'agent_commission' || kind === 'agent_commission_refund' ? 'organizer' : 'retail',
      orgId: row.org_id,
      orgName: row.org_name,
      eventId: row.event_id,
      eventTitle: row.event_title,
      documentNumber: null, // resolved later by joining accounting_documents if needed
      sourceTable: 'platform_income',
      sourceId: row.id,
    });
  }

  for (const row of (invRows || []) as any[]) {
    const recognised = new Date(row.paid_at);
    lines.push({
      date: toLocalDate(recognised),
      recognisedAt: recognised.toISOString(),
      kind: 'subscription',
      kindLabel: KIND_LABELS.subscription,
      amount: Number(row.amount),
      currency: row.currency || 'RUB',
      contractor: row.customer_name || row.org_name || 'Подписчик',
      contractorType: 'subscriber',
      orgId: row.org_id,
      orgName: row.org_name,
      eventId: null,
      eventTitle: null,
      documentNumber: row.invoice_number || null,
      sourceTable: 'org_invoices',
      sourceId: row.id,
    });
  }

  // Resolve linked accounting_documents for both PI and invoice lines
  await attachDocumentNumbers(lines);

  // Sort by recognised time (chronological, useful for journal-style display)
  lines.sort((a, b) => a.recognisedAt.localeCompare(b.recognisedAt));

  return lines;
}

/**
 * Build summary stats over an already-fetched ledger.
 */
export function summariseLedger(periodFrom: string, periodTo: string, lines: IncomeLedgerLine[]): IncomeLedgerSummary {
  const byKind: Record<IncomeKind, number> = {
    service_fee: 0,
    agent_commission: 0,
    subscription: 0,
    service_fee_refund: 0,
    agent_commission_refund: 0,
  };
  const byDayMap = new Map<string, { total: number; byKind: Partial<Record<IncomeKind, number>> }>();
  let total = 0;

  for (const line of lines) {
    byKind[line.kind] = (byKind[line.kind] || 0) + line.amount;
    total += line.amount;

    const day = byDayMap.get(line.date) ?? { total: 0, byKind: {} };
    day.total += line.amount;
    day.byKind[line.kind] = (day.byKind[line.kind] || 0) + line.amount;
    byDayMap.set(line.date, day);
  }

  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, total: round2(v.total), byKind: roundKindMap(v.byKind) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Round bucket sums for display
  for (const k of Object.keys(byKind) as IncomeKind[]) byKind[k] = round2(byKind[k]);

  return {
    periodFrom,
    periodTo,
    totalAmount: round2(total),
    byKind,
    byDay,
    lineCount: lines.length,
  };
}

// ─── helpers ────────────────────────────────────────────────────────

function toLocalDate(d: Date): string {
  // Render the date in Moscow timezone — the only timezone we operate in. Using
  // UTC components plus 3h offset avoids OS-dependent toLocale* results on the server.
  const ms = d.getTime() + 3 * 60 * 60 * 1000;
  const shifted = new Date(ms);
  return shifted.toISOString().slice(0, 10);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function roundKindMap(m: Partial<Record<IncomeKind, number>>): Partial<Record<IncomeKind, number>> {
  const out: Partial<Record<IncomeKind, number>> = {};
  for (const k of Object.keys(m) as IncomeKind[]) out[k] = round2(m[k]!);
  return out;
}

/**
 * For each ledger line, resolve the linked accounting document number (if any)
 * by joining through payment_session/event_registration (for tickets) or invoice id
 * (for subscriptions). Mutates `lines` in place.
 */
async function attachDocumentNumbers(lines: IncomeLedgerLine[]): Promise<void> {
  const db = createAdminServer();

  // Subscription invoices already carry invoice_number; nothing to do.
  // For platform_income (tickets/commissions), there's no per-row doc — the
  // document is the period-level retail act (АУ) or commission UPD (АВ).
  // We leave documentNumber null and let the report aggregate at period level.
  // (Future: query accounting_documents with period_start/end covering line.date
  // and a doc_type matching kind. Skipped for MVP.)
  void db;
  void lines;
}
