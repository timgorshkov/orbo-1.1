import { NextRequest, NextResponse } from 'next/server'
import { processOnboardingMessages } from '@/lib/services/onboardingChainService'
import { createCronLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const logger = createCronLogger('send-onboarding')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Unauthorized cron call attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    logger.info('Onboarding cron triggered')
    const stats = await processOnboardingMessages()

    logger.info(stats, `Onboarding cron done: sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed} processed=${stats.processed}`)

    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Onboarding cron failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
