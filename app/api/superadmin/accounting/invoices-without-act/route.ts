import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { requireSuperadmin } from '@/lib/server/superadminGuard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/superadmin/accounting/invoices-without-act
 *
 * Возвращает оплаченные инвойсы, у которых нет связанного accounting_document
 * (act_number в инвойсе может быть выставлен из legacy-полей или пустым, но
 * в accounting_documents записи нет). Используется для ручного перегенерирования
 * актов (например, при миграции старых инвойсов к новой логике АЛ).
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, {
    endpoint: 'superadmin/accounting/invoices-without-act',
  })
  try {
    await requireSuperadmin()
    const db = createAdminServer()

    const { data, error } = await db.raw(
      `SELECT
         i.id, i.org_id, i.amount, i.currency, i.status,
         to_char(i.period_start, 'YYYY-MM-DD') AS period_start,
         to_char(i.period_end,   'YYYY-MM-DD') AS period_end,
         i.paid_at,
         i.customer_type, i.customer_name, i.customer_email,
         i.act_number AS legacy_act_number,
         i.act_document_url AS legacy_act_url,
         o.name AS org_name,
         o.licensee_full_name,
         o.licensee_email,
         s.plan_code,
         bp.name AS plan_name
       FROM org_invoices i
       LEFT JOIN organizations o ON o.id = i.org_id
       LEFT JOIN org_subscriptions s ON s.id = i.subscription_id
       LEFT JOIN billing_plans bp ON bp.code = s.plan_code
       WHERE i.status = 'paid'
         AND i.accounting_document_id IS NULL
         AND COALESCE(i.act_required, TRUE) = TRUE
       ORDER BY i.paid_at DESC NULLS LAST, i.created_at DESC
       LIMIT 100`,
      []
    )
    if (error) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    return NextResponse.json({ invoices: data || [] })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error listing invoices without act'
    )
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
