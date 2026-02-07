import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/my-registration' });
  try {
    const { id: eventId } = await params
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event to find org_id
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Find participant by user_id and org_id
    const { data: participant, error: participantError } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .is('merged_into', null)
      .maybeSingle()

    if (participantError || !participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Get user's registration for this event
    const { data: registration, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('id, status, payment_status, price, paid_amount, quantity, registered_at, qr_token')
      .eq('event_id', eventId)
      .eq('participant_id', participant.id)
      .in('status', ['registered', 'attended'])
      .maybeSingle()

    if (regError) {
      logger.error({ error: regError.message, event_id: eventId }, 'Error fetching registration');
      return NextResponse.json({ error: regError.message }, { status: 500 })
    }

    if (!registration) {
      return NextResponse.json({ registration: null }, { status: 200 })
    }

    // Calculate payment deadline if applicable
    let payment_deadline = null
    if (registration.payment_status === 'pending' || registration.payment_status === 'overdue') {
      const { data: eventDetails } = await adminSupabase
        .from('events')
        .select('payment_deadline_days, event_date')
        .eq('id', eventId)
        .single()

      if (eventDetails && eventDetails.payment_deadline_days) {
        const registeredDate = new Date(registration.registered_at)
        const deadlineDate = new Date(registeredDate)
        deadlineDate.setDate(deadlineDate.getDate() + eventDetails.payment_deadline_days)
        
        // Don't allow deadline to be after event date
        const eventDate = new Date(eventDetails.event_date)
        if (deadlineDate > eventDate) {
          payment_deadline = eventDate.toISOString()
        } else {
          payment_deadline = deadlineDate.toISOString()
        }
      }
    }

    return NextResponse.json({
      registration: {
        ...registration,
        payment_deadline
      }
    }, { status: 200 })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in GET /api/events/[id]/my-registration');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

