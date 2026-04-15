import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { generateServiceFeeReport } from '@/lib/services/serviceFeeReportService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/superadmin/accounting/service-fee-report/generate
 *
 * Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *
 * Создаёт запись accounting_documents с doc_type=service_fee_report,
 * рендерит HTML и загружает в S3. Возвращает { documentId, docNumber, htmlUrl, ... }.
 * Если за период нет сервисных сборов — 400.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, {
    endpoint: '/api/superadmin/accounting/service-fee-report/generate',
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

    const body = await request.json().catch(() => ({}))
    const { from, to } = body as { from?: string; to?: string }

    if (!from || !to) {
      return NextResponse.json(
        { error: '"from" and "to" (YYYY-MM-DD) are required' },
        { status: 400 }
      )
    }

    if (from > to) {
      return NextResponse.json(
        { error: '"from" must be earlier than or equal to "to"' },
        { status: 400 }
      )
    }

    try {
      const result = await generateServiceFeeReport(from, to)
      logger.info(
        {
          doc_number: result.docNumber,
          period_from: from,
          period_to: to,
          total_amount: result.totalAmount,
          payments_count: result.paymentsCount,
          user_id: user.id,
        },
        'Service fee report generated via superadmin'
      )
      return NextResponse.json(result)
    } catch (genErr: any) {
      if (/нет сервисных сборов/i.test(genErr.message)) {
        return NextResponse.json({ error: genErr.message }, { status: 400 })
      }
      throw genErr
    }
  } catch (err: any) {
    logger.error(
      { error: err.message, stack: err.stack },
      'Error in POST service-fee-report/generate'
    )
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
