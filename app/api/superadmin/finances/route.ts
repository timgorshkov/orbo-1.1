import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/superadmin/finances — platform financial overview
 *
 * Query params:
 *   view: 'overview' | 'withdrawals' | 'org-detail' | 'org-transactions'
 *   orgId: (for org-detail, org-transactions)
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
        // Total platform stats
        const { data: stats } = await db.raw(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'payment_incoming' THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN type = 'commission_deduction' THEN ABS(amount) ELSE 0 END), 0) as total_commission,
            COALESCE(SUM(CASE WHEN type IN ('withdrawal_completed') THEN ABS(amount) ELSE 0 END), 0) as total_withdrawn,
            COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(amount) ELSE 0 END), 0) as total_refunded,
            COUNT(*) FILTER (WHERE type = 'payment_incoming') as payment_count
          FROM org_transactions
        `, [])

        // Pending withdrawals count
        const { data: pendingWd } = await db.raw(`
          SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
          FROM org_withdrawals WHERE status IN ('requested', 'processing')
        `, [])

        // Orgs with non-zero balance
        const { data: activeOrgs } = await db.raw(`
          SELECT COUNT(DISTINCT sub.org_id) as count
          FROM (
            SELECT org_id, balance_after
            FROM org_transactions t1
            WHERE created_at = (SELECT MAX(created_at) FROM org_transactions t2 WHERE t2.org_id = t1.org_id)
            AND balance_after > 0
          ) sub
        `, [])

        return NextResponse.json({
          ...(stats?.[0] || {}),
          pending_withdrawals_count: parseInt(pendingWd?.[0]?.count || '0'),
          pending_withdrawals_total: parseFloat(pendingWd?.[0]?.total || '0'),
          orgs_with_balance: parseInt(activeOrgs?.[0]?.count || '0'),
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

        // Org info + account + balance
        const { data: orgInfo } = await db.raw(`
          SELECT o.id, o.name, o.slug,
                 oa.commission_rate, oa.min_withdrawal_amount, oa.is_active,
                 c.status as contract_status, c.contract_number
          FROM organizations o
          LEFT JOIN org_accounts oa ON oa.org_id = o.id
          LEFT JOIN contracts c ON c.org_id = o.id AND c.status IN ('verified', 'signed', 'filled_by_client')
          WHERE o.id = $1
        `, [orgId])

        // Balance
        const { data: balanceRow } = await db.raw(`
          SELECT balance_after FROM org_transactions
          WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [orgId])

        // Event payment breakdown
        const { data: eventBreakdown } = await db.raw(`
          SELECT e.id, e.title, e.event_date,
                 COUNT(t.id) as payment_count,
                 COALESCE(SUM(t.amount), 0) as total_collected,
                 COALESCE(SUM(CASE WHEN t2.type = 'commission_deduction' THEN ABS(t2.amount) ELSE 0 END), 0) as total_commission
          FROM events e
          JOIN org_transactions t ON t.event_id = e.id AND t.type = 'payment_incoming'
          LEFT JOIN org_transactions t2 ON t2.event_id = e.id AND t2.type = 'commission_deduction'
          WHERE e.org_id = $1
          GROUP BY e.id, e.title, e.event_date
          ORDER BY e.event_date DESC
          LIMIT 50
        `, [orgId])

        // Summary
        const { data: summary } = await db.raw(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'payment_incoming' THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN type = 'commission_deduction' THEN ABS(amount) ELSE 0 END), 0) as total_commission,
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

        return NextResponse.json({ transactions: transactions || [], total })
      }

      // ─── Org search ────────────────────────────────────────────
      case 'org-search': {
        const query = sp.get('query') || ''
        if (query.length < 2) return NextResponse.json({ organizations: [] })

        const { data: orgs } = await db.raw(`
          SELECT id, name FROM organizations
          WHERE name ILIKE $1
          ORDER BY name
          LIMIT 10
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
