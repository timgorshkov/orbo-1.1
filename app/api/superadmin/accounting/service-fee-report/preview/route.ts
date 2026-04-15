import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import {
  previewServiceFeeReport,
  getLastReportPeriodEnd,
  getNextRequiredFrom,
} from '@/lib/services/serviceFeeReportService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/superadmin/accounting/service-fee-report/preview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Предпросмотр «Отчёта о розничных продажах» (ОРП) за период. Возвращает:
 *   - eventLines: сгруппированные по мероприятию позиции
 *   - payments: детализация по каждой оплате
 *   - totalAmount, paymentsCount, eventsCount
 *   - lastReportPeriodEnd: дата period_end последнего сформированного ОРП
 *                         (подсказка для дефолтного начала периода)
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, {
    endpoint: '/api/superadmin/accounting/service-fee-report/preview',
  })

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
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Query params "from" and "to" (YYYY-MM-DD) are required' },
        { status: 400 }
      )
    }

    if (from > to) {
      return NextResponse.json(
        { error: '"from" must be earlier than or equal to "to"' },
        { status: 400 }
      )
    }

    const [preview, lastPeriodEnd, requiredFrom] = await Promise.all([
      previewServiceFeeReport(from, to),
      getLastReportPeriodEnd(),
      getNextRequiredFrom(),
    ])

    return NextResponse.json({
      ...preview,
      lastReportPeriodEnd: lastPeriodEnd,
      requiredFrom,
    })
  } catch (err: any) {
    logger.error(
      { error: err.message, stack: err.stack },
      'Error in GET service-fee-report/preview'
    )
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
