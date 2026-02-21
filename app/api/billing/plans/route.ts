import { NextResponse } from 'next/server'
import { getPlans } from '@/lib/services/billingService'

export const dynamic = 'force-dynamic'

export async function GET() {
  const plans = await getPlans()
  return NextResponse.json({ plans })
}
