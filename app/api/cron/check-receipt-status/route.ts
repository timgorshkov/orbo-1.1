import { NextRequest, NextResponse } from 'next/server'
import { createCronLogger } from '@/lib/logger'
import { pollPendingStatuses } from '@/lib/services/fiscalReceiptService'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/cron/check-receipt-status
 * Проверяет статус чеков в OrangeData (pending → succeeded/failed).
 * Расписание: каждые 2 минуты.
 */
export async function POST(request: NextRequest) {
  const logger = createCronLogger('check-receipt-status')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await pollPendingStatuses()
    logger.info(result, 'Check receipt status cron completed')
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Check receipt status cron failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
