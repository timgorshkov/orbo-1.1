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

    // Get event to find org_id and parent (for recurring child instances)
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('org_id, parent_event_id')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // For recurring child instances, registrations are stored on the parent event.
    // Without this, the public event page won't find the user's series registration
    // when they open a child instance and the payment block disappears.
    const regEventId = (event as any).parent_event_id || eventId

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

    // Get user's registration on the registration-bearing event (parent for series)
    const { data: registration, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('id, status, payment_status, price, paid_amount, quantity, registered_at, qr_token')
      .eq('event_id', regEventId)
      .eq('participant_id', participant.id)
      .in('status', ['registered', 'attended'])
      .maybeSingle()

    if (regError) {
      logger.error({ error: regError.message, event_id: eventId }, 'Error fetching registration');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!registration) {
      return NextResponse.json({ registration: null }, { status: 200 })
    }

    // Backfill missing qr_token (can happen if trigger was bypassed, e.g. direct SQL inserts)
    if (!registration.qr_token) {
      const newToken = crypto.randomUUID()
      await adminSupabase
        .from('event_registrations')
        .update({ qr_token: newToken })
        .eq('id', registration.id)
      registration.qr_token = newToken
    }

    // Calculate payment deadline if applicable.
    // For series: deadline счиатем относительно последнего child instance — пока серия
    // активна, оплата не считается просроченной (см. мигр. 296).
    let payment_deadline = null
    if (registration.payment_status === 'pending' || registration.payment_status === 'overdue') {
      const { data: regEvent } = await adminSupabase
        .from('events')
        .select('payment_deadline_days, event_date, is_recurring, parent_event_id')
        .eq('id', regEventId)
        .single()

      if (regEvent && regEvent.payment_deadline_days) {
        // Effective end date: last child instance for series parents, event_date otherwise.
        let effectiveEndDate = regEvent.event_date as string
        if (regEvent.is_recurring && !regEvent.parent_event_id) {
          const { data: lastChild } = await adminSupabase
            .from('events')
            .select('event_date')
            .eq('parent_event_id', regEventId)
            .order('event_date', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (lastChild?.event_date) {
            effectiveEndDate = lastChild.event_date
          }
        }

        const registeredDate = new Date(registration.registered_at)
        const deadlineDate = new Date(registeredDate)
        deadlineDate.setDate(deadlineDate.getDate() + regEvent.payment_deadline_days)

        // Don't allow deadline to be after the effective end date.
        const endDate = new Date(effectiveEndDate)
        if (deadlineDate > endDate) {
          payment_deadline = endDate.toISOString()
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
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

