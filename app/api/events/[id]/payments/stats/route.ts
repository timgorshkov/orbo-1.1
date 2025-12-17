import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

/**
 * GET /api/events/[id]/payments/stats
 * 
 * Get payment statistics for an event.
 * Only accessible by admins of the organization.
 * 
 * Returns:
 * - total_registrations: number of registrations requiring payment
 * - total_expected_amount: sum of all prices
 * - total_paid_amount: sum of all paid amounts
 * - paid_count: number of paid registrations
 * - pending_count: number of pending payments
 * - overdue_count: number of overdue payments
 * - payment_completion_percent: percentage of paid registrations
 * - breakdown_by_status: count per each payment status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/payments/stats' });
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()
    const supabaseAdmin = createAdminServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event and check if user is admin (use admin client to bypass RLS)
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, title, org_id, requires_payment, default_price, currency')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights (use admin client to bypass RLS)
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can view payment statistics' },
        { status: 403 }
      )
    }

    // Use the PostgreSQL function to get stats (use admin client to bypass RLS)
    const { data: stats, error: statsError } = await supabaseAdmin
      .rpc('get_event_payment_stats', { p_event_id: eventId })
      .single()

    if (statsError) {
      logger.error({ error: statsError.message, event_id: eventId }, 'Error fetching payment stats');
      return NextResponse.json({ error: statsError.message }, { status: 500 })
    }

    // Type assertion for RPC result
    interface PaymentStats {
      total_registrations: number
      total_expected_amount: number
      total_paid_amount: number
      paid_count: number
      pending_count: number
      overdue_count: number
      payment_completion_percent: number
    }
    
    const paymentStats = stats as PaymentStats | null

    // Get breakdown by status (more detailed) (use admin client to bypass RLS)
    const { data: statusBreakdown, error: breakdownError } = await supabaseAdmin
      .from('event_registrations')
      .select('payment_status')
      .eq('event_id', eventId)
      .not('price', 'is', null)

    if (breakdownError) {
      logger.error({ error: breakdownError.message, event_id: eventId }, 'Error fetching status breakdown');
    }

    // Count by status
    const breakdownCounts: Record<string, number> = {}
    statusBreakdown?.forEach((reg: any) => {
      const status = reg.payment_status || 'pending'
      breakdownCounts[status] = (breakdownCounts[status] || 0) + 1
    })

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        requires_payment: event.requires_payment,
        default_price: event.default_price,
        currency: event.currency
      },
      stats: {
        total_registrations: paymentStats?.total_registrations || 0,
        total_expected_amount: paymentStats?.total_expected_amount || 0,
        total_paid_amount: paymentStats?.total_paid_amount || 0,
        paid_count: paymentStats?.paid_count || 0,
        pending_count: paymentStats?.pending_count || 0,
        overdue_count: paymentStats?.overdue_count || 0,
        payment_completion_percent: paymentStats?.payment_completion_percent || 0,
        breakdown_by_status: breakdownCounts
      }
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      event_id: eventId
    }, 'Error in GET /api/events/[id]/payments/stats');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

