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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await processOnboardingMessages()

    if (stats.processed > 0) {
      logger.info(stats, 'Onboarding cron completed')
    }

    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Onboarding cron failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
