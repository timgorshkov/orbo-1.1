import { NextRequest, NextResponse } from 'next/server'
import { createCronLogger } from '@/lib/logger'
import { processPendingReceipts } from '@/lib/services/fiscalReceiptService'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/cron/send-fiscal-receipts
 * Отправляет чеки в статусе 'created' в OrangeData (retry).
 * Расписание: каждые 5 минут.
 */
export async function POST(request: NextRequest) {
  const logger = createCronLogger('send-fiscal-receipts')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processPendingReceipts()
    logger.info(result, 'Send fiscal receipts cron completed')
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Send fiscal receipts cron failed')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
