import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createCronLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/cron/check-overdue-payments
 * Помечает просроченные оплаты за события (pending → overdue).
 * Использует SQL-функцию mark_overdue_payments() из миграции 114.
 * Расписание: каждый час.
 */
export async function POST(request: NextRequest) {
  const logger = createCronLogger('check-overdue-payments')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = createAdminServer()

    // Делегируем в SQL-функцию — единый источник логики (см. мигр. 296):
    // - standalone event: deadline = event_date - payment_deadline_days
    // - series parent: deadline = MAX(child.event_date) - payment_deadline_days
    //   (а пока children не сгенерированы — never overdue)
    const { data, error } = await db.raw(
      `SELECT mark_overdue_payments() AS marked`,
      []
    )

    if (error) throw new Error(error.message)

    const marked = (data?.[0] as any)?.marked ?? 0

    if (marked > 0) {
      logger.info({ marked }, 'Overdue payments marked')
    }

    return NextResponse.json({ success: true, marked })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to check overdue payments')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
