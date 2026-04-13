import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { activatePro, addPayment, cancelSubscription, getOrgBillingStatus, getOrgInvoices, activatePromo } from '@/lib/services/billingService'

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
    const { action, months, paymentMethod, amount, planCode, customer } = body

    switch (action) {
      case 'activate_pro': {
        const success = await activatePro(orgId, months || 1, user.id, paymentMethod)
        if (!success) return NextResponse.json({ error: 'Activation failed' }, { status: 500 })
        return NextResponse.json({ success: true, message: `Pro activated for ${months || 1} month(s)` })
      }
      case 'add_payment': {
        const amt = typeof amount === 'string' ? parseFloat(amount) : amount
        if (!amt || isNaN(amt) || amt <= 0) {
          return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
        }

        // Validate customer data if provided (used for act generation, not for receipt)
        if (customer) {
          if (!customer.type || !['individual', 'legal_entity', 'self_employed'].includes(customer.type)) {
            return NextResponse.json({ error: 'customer.type must be individual, legal_entity or self_employed' }, { status: 400 })
          }
          if (!customer.name || customer.name.trim().length < 4) {
            return NextResponse.json({ error: 'customer.name required (ФИО или название организации)' }, { status: 400 })
          }
          // Email is still useful for the act (contact info), but not strictly required for manual entry
          // since no fiscal receipt is generated for manual payments (see generateReceipt: false below).
        }

        const result = await addPayment({
          orgId,
          amount: amt,
          confirmedBy: user.id,
          planCode: planCode || 'pro',
          paymentMethod: paymentMethod || 'manual',
          gatewayCode: paymentMethod === 'bank_transfer' ? 'manual' : undefined,
          customer: customer ? {
            type: customer.type,
            name: customer.name.trim(),
            inn: customer.inn || null,
            email: customer.email || null,
            phone: customer.phone || null,
          } : undefined,
          // Manual superadmin payment confirmation — we do NOT issue fiscal receipts here.
          // Cash registers (ОФД) are only used for online acquiring (T-Bank / YooKassa / SBP).
          // Bank transfer payments recorded manually by superadmin are NOT fiscalized at this stage.
          generateReceipt: false,
        })

        if (!result.success) return NextResponse.json({ error: 'Payment failed' }, { status: 500 })
        return NextResponse.json({ success: true, ...result })
      }
      case 'activate_promo': {
        const success = await activatePromo(orgId, user.id)
        if (!success) return NextResponse.json({ error: 'Promo activation failed' }, { status: 500 })
        return NextResponse.json({ success: true, message: 'Promo plan activated' })
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
