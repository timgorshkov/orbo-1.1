import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/superadmin/accounting
 *
 * Query params:
 *   - from        ISO date (inclusive), default — 1 числа текущего месяца
 *   - to          ISO date (inclusive), default — сегодня
 *   - docType     subscription_act | agent_commission_upd (опционально)
 *   - orgId       UUID (опционально)
 *   - status      draft|generated|sent|accepted|cancelled (опционально)
 *   - limit       1..500, default 100
 *   - offset      default 0
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/accounting' })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = createAdminServer()
    const { data: superadminRow } = await db
      .from('superadmins')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!superadminRow) {
      return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    // Период по умолчанию — текущий месяц
    const now = new Date()
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const defaultTo = now.toISOString().split('T')[0]

    const from = searchParams.get('from') || defaultFrom
    const to = searchParams.get('to') || defaultTo
    const docType = searchParams.get('docType')
    const orgId = searchParams.get('orgId')
    const status = searchParams.get('status')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    const conditions: string[] = ['d.doc_date BETWEEN $1::date AND $2::date']
    const params: any[] = [from, to]
    let p = 2

    if (docType) {
      params.push(docType)
      conditions.push(`d.doc_type = $${++p}`)
    }
    if (orgId) {
      params.push(orgId)
      conditions.push(`d.org_id = $${++p}`)
    }
    if (status) {
      params.push(status)
      conditions.push(`d.status = $${++p}`)
    }

    const whereSql = conditions.join(' AND ')

    // Данные
    params.push(limit)
    const limitParam = ++p
    params.push(offset)
    const offsetParam = ++p

    const { data: rows, error } = await db.raw(
      `SELECT
         d.id, d.doc_type, d.doc_number, d.doc_date,
         d.period_start, d.period_end,
         d.org_id, d.customer_type,
         d.total_amount, d.currency, d.status,
         d.html_url,
         d.customer_requisites->>'name' AS customer_name,
         d.customer_requisites->>'inn' AS customer_inn,
         d.elba_document_id, d.elba_url, d.elba_sync_status, d.elba_error,
         d.created_at,
         o.name AS org_name
       FROM accounting_documents d
       LEFT JOIN organizations o ON o.id = d.org_id
       WHERE ${whereSql}
       ORDER BY d.doc_date DESC, d.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    )

    if (error) {
      logger.error({ error: error.message }, 'Failed to load accounting documents')
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
    }

    // Агрегаты — та же выборка без LIMIT/OFFSET
    const aggregateParams = params.slice(0, limitParam - 1)
    const { data: aggData } = await db.raw(
      `SELECT
         COUNT(*)::int AS total_count,
         COALESCE(SUM(d.total_amount), 0)::numeric(14,2) AS total_sum,
         COUNT(*) FILTER (WHERE d.doc_type = 'subscription_act')::int AS subscription_acts_count,
         COUNT(*) FILTER (WHERE d.doc_type = 'agent_commission_upd')::int AS commission_upds_count,
         COUNT(*) FILTER (WHERE d.doc_type = 'retail_act')::int AS retail_acts_count
       FROM accounting_documents d
       WHERE ${whereSql}`,
      aggregateParams
    )

    return NextResponse.json({
      documents: rows || [],
      aggregates: aggData?.[0] || {
        total_count: 0,
        total_sum: 0,
        subscription_acts_count: 0,
        commission_upds_count: 0,
        retail_acts_count: 0,
      },
      filters: { from, to, docType, orgId, status, limit, offset },
    })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error in GET /api/superadmin/accounting')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
