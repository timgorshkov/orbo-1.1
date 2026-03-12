import { NextResponse } from 'next/server'
import { getPlans } from '@/lib/services/billingService'

export const dynamic = 'force-dynamic'

export async function GET() {
  const allPlans = await getPlans()
  const plans = allPlans.filter(p => !p.is_hidden)
  return NextResponse.json({ plans })
}
