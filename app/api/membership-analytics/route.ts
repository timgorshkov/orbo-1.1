import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'membership-analytics' })
  try {
    const url = new URL(req.url)
    const orgId = url.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminServer()

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Active members by status
    const { data: statusCounts } = await supabase
      .from('participant_memberships')
      .select('status')
      .eq('org_id', orgId)

    const counts: Record<string, number> = {}
    for (const row of statusCounts || []) {
      counts[row.status] = (counts[row.status] || 0) + 1
    }

    // MRR estimate: sum of active monthly-equivalent prices
    const { data: activeMemberships } = await supabase
      .from('participant_memberships')
      .select('plan:membership_plans(price, billing_period, custom_period_days)')
      .eq('org_id', orgId)
      .in('status', ['active', 'trial'])

    let mrr = 0
    for (const m of activeMemberships || []) {
      const plan = m.plan as any
      if (!plan?.price) continue
      const monthlyPrice = toMonthly(plan.price, plan.billing_period, plan.custom_period_days)
      mrr += monthlyPrice
    }

    // Revenue this month (confirmed payments)
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data: monthPayments } = await supabase
      .from('membership_payments')
      .select('amount')
      .eq('org_id', orgId)
      .eq('status', 'confirmed')
      .gte('paid_at', monthStart.toISOString())

    const revenueThisMonth = (monthPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0)

    // Total confirmed revenue
    const { data: allPayments } = await supabase
      .from('membership_payments')
      .select('amount')
      .eq('org_id', orgId)
      .eq('status', 'confirmed')

    const totalRevenue = (allPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0)

    // New memberships this month
    const { count: newThisMonth } = await supabase
      .from('participant_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', monthStart.toISOString())

    // Churn: expired or cancelled this month
    const { count: churnedThisMonth } = await supabase
      .from('participant_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['expired', 'cancelled'])
      .gte('updated_at', monthStart.toISOString())

    const totalActive = (counts['active'] || 0) + (counts['trial'] || 0)
    const churnRate = totalActive > 0
      ? Math.round(((churnedThisMonth || 0) / (totalActive + (churnedThisMonth || 0))) * 100)
      : 0

    return NextResponse.json({
      statusCounts: counts,
      totalActive,
      totalMembers: Object.values(counts).reduce((a, b) => a + b, 0),
      mrr: Math.round(mrr * 100) / 100,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      newThisMonth: newThisMonth || 0,
      churnedThisMonth: churnedThisMonth || 0,
      churnRate,
    })
  } catch (err) {
    logger.error({ error: err }, 'Error fetching membership analytics')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function toMonthly(price: number, period: string, customDays?: number): number {
  switch (period) {
    case 'weekly': return price * 4.33
    case 'monthly': return price
    case 'quarterly': return price / 3
    case 'semi_annual': return price / 6
    case 'annual': return price / 12
    case 'one_time': return 0
    case 'custom': return customDays ? (price / customDays) * 30 : 0
    default: return price
  }
}
