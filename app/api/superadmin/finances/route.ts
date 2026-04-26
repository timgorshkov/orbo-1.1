import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic'

/** Convert period param to a date string for WHERE filters */
function periodToDate(period: string | null): string | null {
  const now = new Date()
  switch (period) {
    case 'all':
      return null
    case 'year':
      return `${now.getFullYear()}-01-01`
    case 'month':
    default:
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  }
}

/** Transaction type labels for frontend display */
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  payment_incoming: 'Входящий платёж',
  commission_deduction: 'Комиссия сервиса',
  agent_commission: 'Агентское вознаграждение',
  agent_commission_reversal: 'Возврат агентского вознаграждения',
  refund: 'Возврат',
  withdrawal_requested: 'Запрос на вывод',
  withdrawal_completed: 'Вывод выполнен',
  withdrawal_rejected: 'Вывод отклонён',
  manual_adjustment: 'Ручная корректировка',
}

/**
 * GET /api/superadmin/finances — platform financial overview
 *
 * Query params:
 *   view: 'overview' | 'withdrawals' | 'org-detail' | 'org-transactions' | 'org-search'
 *   period: 'all' | 'year' | 'month' (for overview, default: month)
 *   orgId: (for org-detail, org-transactions)
 *   query: (for org-search)
 *   status: (for withdrawals filter)
 *   dateFrom, dateTo: date filters
 *   page, pageSize: pagination
 *   eventId: (for org-transactions filter)
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/finances' })

  if (!(await isSuperadmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createAdminServer()
  const sp = request.nextUrl.searchParams
  const view = sp.get('view') || 'overview'
  const page = parseInt(sp.get('page') || '1')
  const pageSize = Math.min(parseInt(sp.get('pageSize') || '50'), 100)
  const offset = (page - 1) * pageSize

  try {
    switch (view) {
      // ─── Platform overview ─────────────────────────────────────
      case 'overview': {
        const dateFilter = periodToDate(sp.get('period'))

        // Build date condition for org_transactions
        const txDateCondition = dateFilter ? 'WHERE created_at >= $1' : ''
        const txParams: any[] = dateFilter ? [dateFilter] : []

        // Total platform stats from org_transactions
        const { data: stats } = await db.raw(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'payment_incoming' THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN type = 'commission_deduction' THEN ABS(amount) ELSE 0 END), 0) as total_commission,
            COALESCE(SUM(CASE WHEN type IN ('withdrawal_completed') THEN ABS(amount) ELSE 0 END), 0) as total_withdrawn,
            COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(amount) ELSE 0 END), 0) as total_refunded,
            COUNT(*) FILTER (WHERE type = 'payment_incoming') as payment_count
          FROM org_transactions
          ${txDateCondition}
        `, txParams)

        // Pending withdrawals count (not filtered by period — always show current pending)
        const { data: pendingWd } = await db.raw(`
          SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
          FROM org_withdrawals WHERE status IN ('requested', 'processing')
        `, [])

        // Orgs with non-zero balance (not filtered by period — current state)
        const { data: activeOrgs } = await db.raw(`
          SELECT COUNT(DISTINCT sub.org_id) as count
          FROM (
            SELECT org_id, balance_after
            FROM org_transactions t1
            WHERE created_at = (SELECT MAX(created_at) FROM org_transactions t2 WHERE t2.org_id = t1.org_id)
            AND balance_after > 0
          ) sub
        `, [])

        // Revenue breakdown from platform_income
        const piDateCondition = dateFilter ? 'WHERE created_at >= $1' : ''
        const piParams: any[] = dateFilter ? [dateFilter] : []

        const { data: revenueBreakdown } = await db.raw(`
          SELECT
            COALESCE(SUM(CASE WHEN income_type = 'service_fee' THEN amount ELSE 0 END), 0) as total_service_fees,
            COALESCE(SUM(CASE WHEN income_type = 'agent_commission' THEN amount ELSE 0 END), 0) as total_agent_commission,
            COUNT(*) FILTER (WHERE income_type = 'service_fee') as service_fee_count,
            COUNT(*) FILTER (WHERE income_type = 'agent_commission') as agent_commission_count
          FROM platform_income
          ${piDateCondition}
        `, piParams)

        // Subscription revenue from org_invoices
        const invDateCondition = dateFilter
          ? "WHERE status = 'paid' AND created_at >= $1"
          : "WHERE status = 'paid'"
        const invParams: any[] = dateFilter ? [dateFilter] : []

        const { data: subscriptionRevenue } = await db.raw(`
          SELECT
            COALESCE(SUM(amount), 0) as total_subscription_revenue,
            COUNT(*) as subscription_count
          FROM org_invoices
          ${invDateCondition}
        `, invParams)

        return NextResponse.json({
          ...(stats?.[0] || {}),
          pending_withdrawals_count: parseInt(pendingWd?.[0]?.count || '0'),
          pending_withdrawals_total: parseFloat(pendingWd?.[0]?.total || '0'),
          orgs_with_balance: parseInt(activeOrgs?.[0]?.count || '0'),
          // Revenue breakdown
          total_service_fees: parseFloat(revenueBreakdown?.[0]?.total_service_fees || '0'),
          total_agent_commission: parseFloat(revenueBreakdown?.[0]?.total_agent_commission || '0'),
          service_fee_count: parseInt(revenueBreakdown?.[0]?.service_fee_count || '0'),
          agent_commission_count: parseInt(revenueBreakdown?.[0]?.agent_commission_count || '0'),
          // Subscription revenue
          total_subscription_revenue: parseFloat(subscriptionRevenue?.[0]?.total_subscription_revenue || '0'),
          subscription_count: parseInt(subscriptionRevenue?.[0]?.subscription_count || '0'),
        })
      }

      // ─── Withdrawals queue ─────────────────────────────────────
      case 'withdrawals': {
        const status = sp.get('status')
        const dateFrom = sp.get('dateFrom')
        const dateTo = sp.get('dateTo')

        let where = 'WHERE 1=1'
        const params: any[] = []
        let paramIdx = 1

        if (status) {
          where += ` AND w.status = $${paramIdx++}`
          params.push(status)
        }
        if (dateFrom) {
          where += ` AND w.requested_at >= $${paramIdx++}`
          params.push(dateFrom)
        }
        if (dateTo) {
          where += ` AND w.requested_at <= $${paramIdx++}`
          params.push(dateTo + 'T23:59:59Z')
        }

        const { data: countResult } = await db.raw(
          `SELECT COUNT(*) as total FROM org_withdrawals w ${where}`, params
        )
        const total = parseInt(countResult?.[0]?.total || '0')

        const { data: withdrawals } = await db.raw(`
          SELECT w.*, o.name as org_name
          FROM org_withdrawals w
          JOIN organizations o ON o.id = w.org_id
          ${where}
          ORDER BY
            CASE w.status
              WHEN 'requested' THEN 0
              WHEN 'processing' THEN 1
              ELSE 2
            END,
            w.requested_at DESC
          LIMIT $${paramIdx++} OFFSET $${paramIdx++}
        `, [...params, pageSize, offset])

        return NextResponse.json({ withdrawals: withdrawals || [], total })
      }

      // ─── Org detail ────────────────────────────────────────────
      case 'org-detail': {
        const orgId = sp.get('orgId')
        if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })

        // Org info + account + balance + counterparty
        const { data: orgInfo } = await db.raw(`
          SELECT o.id, o.name, o.slug,
                 oa.commission_rate, oa.service_fee_rate, oa.agent_commission_rate, oa.min_withdrawal_amount, oa.is_active,
                 c.status as contract_status, c.contract_number,
                 cp.full_name as counterparty_name, cp.type as counterparty_type, cp.org_name as counterparty_org_name
          FROM organizations o
          LEFT JOIN org_accounts oa ON oa.org_id = o.id
          LEFT JOIN contracts c ON c.org_id = o.id AND c.status IN ('verified', 'signed', 'filled_by_client')
          LEFT JOIN counterparties cp ON cp.id = c.counterparty_id
          WHERE o.id = $1
        `, [orgId])

        // Balance
        const { data: balanceRow } = await db.raw(`
          SELECT balance_after FROM org_transactions
          WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [orgId])

        // Event payment breakdown (fixed: single aggregation, no cross-join)
        const { data: eventBreakdown } = await db.raw(`
          SELECT e.id, e.title, e.event_date,
                 COUNT(t.id) FILTER (WHERE t.type = 'payment_incoming') as payment_count,
                 COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'payment_incoming'), 0) as total_collected,
                 COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type = 'commission_deduction'), 0) as total_commission,
                 COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type = 'agent_commission'), 0) as total_agent_commission,
                 COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type = 'refund'), 0) as total_refunded
          FROM events e
          JOIN org_transactions t ON t.event_id = e.id AND t.type IN ('payment_incoming', 'commission_deduction', 'agent_commission', 'refund')
          WHERE e.org_id = $1
          GROUP BY e.id, e.title, e.event_date
          ORDER BY e.event_date DESC
          LIMIT 50
        `, [orgId])

        // Summary (with agent_commission)
        const { data: summary } = await db.raw(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'payment_incoming' THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN type = 'commission_deduction' THEN ABS(amount) ELSE 0 END), 0) as total_commission,
            COALESCE(SUM(CASE WHEN type = 'agent_commission' THEN ABS(amount) ELSE 0 END), 0) as total_agent_commission,
            COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(amount) ELSE 0 END), 0) as total_refunded,
            COUNT(*) FILTER (WHERE type = 'payment_incoming') as payment_count
          FROM org_transactions WHERE org_id = $1
        `, [orgId])

        return NextResponse.json({
          org: orgInfo?.[0] || null,
          balance: parseFloat(balanceRow?.[0]?.balance_after || '0'),
          events: eventBreakdown || [],
          summary: summary?.[0] || {},
        })
      }

      // ─── Org transactions (with participant info) ──────────────
      case 'org-transactions': {
        const orgId = sp.get('orgId')
        if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })

        const eventId = sp.get('eventId')
        const type = sp.get('type')
        const dateFrom = sp.get('dateFrom')
        const dateTo = sp.get('dateTo')

        let where = 'WHERE t.org_id = $1'
        const params: any[] = [orgId]
        let paramIdx = 2

        if (eventId) {
          where += ` AND t.event_id = $${paramIdx++}`
          params.push(eventId)
        }
        if (type) {
          where += ` AND t.type = $${paramIdx++}`
          params.push(type)
        }
        if (dateFrom) {
          where += ` AND t.created_at >= $${paramIdx++}`
          params.push(dateFrom)
        }
        if (dateTo) {
          where += ` AND t.created_at <= $${paramIdx++}`
          params.push(dateTo + 'T23:59:59Z')
        }

        const { data: countResult } = await db.raw(
          `SELECT COUNT(*) as total FROM org_transactions t ${where}`, params
        )
        const total = parseInt(countResult?.[0]?.total || '0')

        const { data: transactions } = await db.raw(`
          SELECT t.*, p.full_name as participant_name, p.username as participant_username,
                 e.title as event_title
          FROM org_transactions t
          LEFT JOIN participants p ON p.id = t.participant_id
          LEFT JOIN events e ON e.id = t.event_id
          ${where}
          ORDER BY t.created_at DESC
          LIMIT $${paramIdx++} OFFSET $${paramIdx++}
        `, [...params, pageSize, offset])

        // Attach type labels to each transaction
        const transactionsWithLabels = (transactions || []).map((t: any) => ({
          ...t,
          type_label: TRANSACTION_TYPE_LABELS[t.type] || t.type,
        }))

        return NextResponse.json({
          transactions: transactionsWithLabels,
          total,
          type_labels: TRANSACTION_TYPE_LABELS,
        })
      }

      // ─── Income ledger (Orbo's own taxable revenue) ────────────
      case 'income-ledger': {
        const from = sp.get('from')
        const to = sp.get('to')
        if (!from || !to) {
          return NextResponse.json({ error: 'from and to (YYYY-MM-DD) required' }, { status: 400 })
        }

        const { getIncomeLedger, summariseLedger } = await import('@/lib/services/incomeLedgerService')
        const lines = await getIncomeLedger(from, to)
        const summary = summariseLedger(from, to, lines)

        // Truncate detailed list to first 500 for UI; full list available via export endpoint
        return NextResponse.json({
          summary,
          lines: lines.slice(0, 500),
          truncated: lines.length > 500,
        })
      }

      // ─── Org search ────────────────────────────────────────────
      case 'org-search': {
        const query = (sp.get('query') || '').trim()

        if (query.length < 2) {
          // Return top 50 orgs with non-zero balance
          const { data: orgs } = await db.raw(`
            SELECT o.id, o.name, o.slug,
              cp.full_name as counterparty_name, cp.type as counterparty_type, cp.org_name as counterparty_org_name,
              COALESCE(bal.balance_after, 0) as balance,
              COALESCE(turn.total_turnover, 0) as total_turnover
            FROM organizations o
            LEFT JOIN contracts c ON c.org_id = o.id AND c.status IN ('verified', 'signed', 'filled_by_client')
            LEFT JOIN counterparties cp ON cp.id = c.counterparty_id
            LEFT JOIN LATERAL (
              SELECT balance_after FROM org_transactions WHERE org_id = o.id ORDER BY created_at DESC LIMIT 1
            ) bal ON true
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(amount), 0) as total_turnover FROM org_transactions WHERE org_id = o.id AND type = 'payment_incoming'
            ) turn ON true
            WHERE COALESCE(bal.balance_after, 0) > 0
            ORDER BY COALESCE(bal.balance_after, 0) DESC
            LIMIT 50
          `, [])

          return NextResponse.json({ organizations: orgs || [] })
        }

        // Search by name with counterparty, balance, and turnover
        const { data: orgs } = await db.raw(`
          SELECT o.id, o.name, o.slug,
            cp.full_name as counterparty_name, cp.type as counterparty_type, cp.org_name as counterparty_org_name,
            COALESCE(bal.balance_after, 0) as balance,
            COALESCE(turn.total_turnover, 0) as total_turnover
          FROM organizations o
          LEFT JOIN contracts c ON c.org_id = o.id AND c.status IN ('verified', 'signed', 'filled_by_client')
          LEFT JOIN counterparties cp ON cp.id = c.counterparty_id
          LEFT JOIN LATERAL (
            SELECT balance_after FROM org_transactions WHERE org_id = o.id ORDER BY created_at DESC LIMIT 1
          ) bal ON true
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(amount), 0) as total_turnover FROM org_transactions WHERE org_id = o.id AND type = 'payment_incoming'
          ) turn ON true
          WHERE o.name ILIKE $1
          ORDER BY COALESCE(bal.balance_after, 0) DESC
          LIMIT 50
        `, [`%${query}%`])

        return NextResponse.json({ organizations: orgs || [] })
      }

      default:
        return NextResponse.json({ error: 'Unknown view' }, { status: 400 })
    }
  } catch (error: any) {
    logger.error({ error: error.message, view }, 'Superadmin finances error')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * PATCH /api/superadmin/finances — manage withdrawals, commission
 *
 * Body:
 *   action: 'process-withdrawal' | 'complete-withdrawal' | 'reject-withdrawal' | 'update-commission'
 */
export async function PATCH(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/finances' })

  if (!(await isSuperadmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action } = body
    const user = (await import('@/lib/auth/unified-auth')).getUnifiedUser
    const currentUser = await user()

    switch (action) {
      case 'process-withdrawal': {
        const { processWithdrawal } = await import('@/lib/services/withdrawalService')
        const withdrawal = await processWithdrawal(body.withdrawalId, currentUser?.id || 'superadmin')
        return NextResponse.json({ withdrawal })
      }

      case 'complete-withdrawal': {
        const { completeWithdrawal, generateWithdrawalAct } = await import('@/lib/services/withdrawalService')
        const withdrawal = await completeWithdrawal(body.withdrawalId, currentUser?.id || 'superadmin')
        // Auto-generate act document
        try {
          await generateWithdrawalAct(body.withdrawalId)
        } catch (actErr: any) {
          logger.warn({ error: actErr.message }, 'Failed to generate act, but withdrawal completed')
        }
        return NextResponse.json({ withdrawal })
      }

      case 'reject-withdrawal': {
        const { rejectWithdrawal } = await import('@/lib/services/withdrawalService')
        const withdrawal = await rejectWithdrawal(body.withdrawalId, currentUser?.id || 'superadmin', body.reason || 'Отклонено администратором')
        return NextResponse.json({ withdrawal })
      }

      case 'update-commission': {
        const { updateOrgAccount } = await import('@/lib/services/orgAccountService')
        const account = await updateOrgAccount(body.orgId, {
          commission_rate: body.commissionRate,
          min_withdrawal_amount: body.minWithdrawal,
        })
        return NextResponse.json({ account })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Superadmin finances action error')
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
