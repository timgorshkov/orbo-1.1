import { NextRequest, NextResponse } from 'next/server'
import { createCronLogger } from '@/lib/logger'
import { generateAllPendingReports } from '@/lib/services/agentReportService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/cron/generate-agent-reports
 * Генерирует отчёты агента за прошлый месяц для всех организаций с активными контрактами.
 * Расписание: 1-го числа каждого месяца в 06:00.
 */
export async function POST(request: NextRequest) {
  const logger = createCronLogger('generate-agent-reports')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await generateAllPendingReports()

    logger.info(result, 'Agent reports generation completed')

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to generate agent reports')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
