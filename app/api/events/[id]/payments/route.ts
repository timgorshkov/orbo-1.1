import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

/**
 * GET /api/events/[id]/payments
 * 
 * Get list of event registrations with payment information.
 * Only accessible by admins of the organization.
 * 
 * Query params:
 * - status: filter by payment_status (pending, paid, overdue, etc.)
 * 
 * Returns:
 * - registrations: array of registrations with participant info and payment details
 * - event: event basic info (title, default_price, currency)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status') // optional filter
    
    const supabase = await createClientServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event and check if user is admin
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, org_id, requires_payment, default_price, currency, payment_deadline_days, payment_instructions, event_date')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can view payment information' },
        { status: 403 }
      )
    }

    // Fetch registrations with payment info and participant details
    let query = supabase
      .from('event_registrations')
      .select(`
        id,
        participant_id,
        status,
        registered_at,
        price,
        payment_status,
        payment_method,
        paid_at,
        paid_amount,
        payment_notes,
        payment_updated_at,
        participants!inner (
          id,
          full_name,
          username,
          tg_user_id,
          photo_url
        )
      `)
      .eq('event_id', eventId)
      .order('registered_at', { ascending: false })

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq('payment_status', statusFilter)
    }

    const { data: registrations, error: regError } = await query

    if (regError) {
      console.error('Error fetching registrations:', regError)
      return NextResponse.json({ error: regError.message }, { status: 500 })
    }

    // Calculate payment deadline for each registration
    const enrichedRegistrations = registrations?.map((reg: any) => {
      let paymentDeadline = null
      if (event.requires_payment && event.payment_deadline_days && event.event_date) {
        const eventDate = new Date(event.event_date)
        const deadlineDate = new Date(eventDate)
        deadlineDate.setDate(deadlineDate.getDate() - (event.payment_deadline_days || 0))
        paymentDeadline = deadlineDate.toISOString()
      }

      return {
        ...reg,
        payment_deadline: paymentDeadline,
        is_overdue: reg.payment_status === 'pending' && paymentDeadline && new Date(paymentDeadline) < new Date()
      }
    })

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        requires_payment: event.requires_payment,
        default_price: event.default_price,
        currency: event.currency,
        payment_deadline_days: event.payment_deadline_days,
        payment_instructions: event.payment_instructions,
        event_date: event.event_date
      },
      registrations: enrichedRegistrations || []
    })
  } catch (error: any) {
    console.error('Error in GET /api/events/[id]/payments:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

