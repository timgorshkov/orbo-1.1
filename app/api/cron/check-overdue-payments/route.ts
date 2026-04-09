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

    // Mark overdue: pending registrations where deadline has passed
    const { data, error } = await db.raw(
      `UPDATE event_registrations er
       SET payment_status = 'overdue', payment_updated_at = NOW()
       FROM events e
       WHERE er.event_id = e.id
         AND er.payment_status = 'pending'
         AND e.requires_payment = true
         AND er.price > 0
         AND e.payment_deadline_days IS NOT NULL
         AND (e.event_date::date - e.payment_deadline_days) < CURRENT_DATE
       RETURNING er.id`,
      []
    )

    const marked = data?.length || 0

    if (marked > 0) {
      logger.info({ marked }, 'Overdue payments marked')
    }

    return NextResponse.json({ success: true, marked })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to check overdue payments')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
