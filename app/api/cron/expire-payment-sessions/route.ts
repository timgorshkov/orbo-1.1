import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createCronLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/cron/expire-payment-sessions
 * Отменяет платёжные сессии, которые висят в статусе pending более 2 часов.
 * Расписание: каждые 15 минут.
 */
export async function POST(request: NextRequest) {
  const logger = createCronLogger('expire-payment-sessions')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = createAdminServer()

    const { data, error } = await db.raw(
      `UPDATE payment_sessions
       SET status = 'cancelled', updated_at = NOW()
       WHERE status = 'pending'
         AND created_at < NOW() - interval '2 hours'
       RETURNING id`,
      []
    )

    const expired = data?.length || 0

    if (expired > 0) {
      logger.info({ expired }, 'Expired payment sessions cancelled')
    }

    return NextResponse.json({ success: true, expired })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to expire payment sessions')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
