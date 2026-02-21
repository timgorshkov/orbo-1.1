import { NextRequest, NextResponse } from 'next/server'
import { getOrgBillingStatus, getOrgInvoices } from '@/lib/services/billingService'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getUnifiedSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 })
  }

  const access = await getEffectiveOrgRole(session.user.id, orgId)
  if (!access || !['owner', 'admin'].includes(access.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [status, invoices] = await Promise.all([
    getOrgBillingStatus(orgId),
    getOrgInvoices(orgId),
  ])

  return NextResponse.json({
    plan: status.plan,
    subscription: status.subscription,
    participantCount: status.participantCount,
    participantLimit: status.participantLimit === Infinity ? -1 : status.participantLimit,
    isOverLimit: status.isOverLimit,
    gracePeriodExpired: status.gracePeriodExpired,
    daysOverLimit: status.daysOverLimit,
    paymentUrl: status.paymentUrl,
    aiEnabled: status.aiEnabled,
    isTrial: status.isTrial,
    trialDaysRemaining: status.trialDaysRemaining,
    trialExpired: status.trialExpired,
    trialWarning: status.trialWarning,
    invoices,
  })
}
