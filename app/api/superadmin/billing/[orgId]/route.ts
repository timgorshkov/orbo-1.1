import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { activatePro, addPayment, cancelSubscription, getOrgBillingStatus, getOrgInvoices } from '@/lib/services/billingService'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/billing/[orgId]' })

  try {
    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminServer()
    const { data: isSuperadmin } = await supabase
      .from('superadmins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()
    if (!isSuperadmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { orgId } = await params

    const [status, invoices] = await Promise.all([
      getOrgBillingStatus(orgId),
      getOrgInvoices(orgId),
    ])

    return NextResponse.json({ ...status, invoices })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Billing detail fetch failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/billing/[orgId]' })

  try {
    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminServer()
    const { data: isSuperadmin } = await supabase
      .from('superadmins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()
    if (!isSuperadmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { orgId } = await params
    const body = await request.json()
    const { action, months, paymentMethod, amount } = body

    switch (action) {
      case 'activate_pro': {
        const success = await activatePro(orgId, months || 1, user.id, paymentMethod)
        if (!success) return NextResponse.json({ error: 'Activation failed' }, { status: 500 })
        return NextResponse.json({ success: true, message: `Pro activated for ${months || 1} month(s)` })
      }
      case 'add_payment': {
        if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
        const result = await addPayment(orgId, amount, user.id, paymentMethod || 'manual')
        if (!result.success) return NextResponse.json({ error: 'Payment failed' }, { status: 500 })
        return NextResponse.json({ success: true, ...result })
      }
      case 'cancel': {
        const success = await cancelSubscription(orgId)
        if (!success) return NextResponse.json({ error: 'Cancellation failed' }, { status: 500 })
        return NextResponse.json({ success: true, message: 'Subscription cancelled' })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Billing action failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
