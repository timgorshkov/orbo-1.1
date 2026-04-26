import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import {
  previewRetailAct,
  getLastActPeriodEnd,
  getNextRequiredFrom,
} from '@/lib/services/retailActService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/superadmin/accounting/retail-act/preview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Предпросмотр «Акта об оказании услуг» (АУ) на сводное физлицо «Розничные
 * покупатели» за период. Возвращает сгруппированные позиции и построчную
 * детализацию по платежам для реестра-расшифровки.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, {
    endpoint: '/api/superadmin/accounting/retail-act/preview',
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
      previewRetailAct(from, to),
      getLastActPeriodEnd(),
      getNextRequiredFrom(),
    ])

    return NextResponse.json({
      ...preview,
      lastActPeriodEnd: lastPeriodEnd,
      requiredFrom,
    })
  } catch (err: any) {
    logger.error(
      { error: err.message, stack: err.stack },
      'Error in GET retail-act/preview'
    )
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
