import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

// POST /api/events/[id]/register - Register for event
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id
    const supabase = await createClientServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*, event_registrations!event_registrations_event_id_fkey(id, status)')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check if event is published
    if (event.status !== 'published') {
      return NextResponse.json(
        { error: 'This event is not open for registration' },
        { status: 400 }
      )
    }

    // Check capacity
    if (event.capacity) {
      const registeredCount = event.event_registrations?.filter(
        (reg: any) => reg.status === 'registered'
      ).length || 0

      if (registeredCount >= event.capacity) {
        return NextResponse.json(
          { error: 'Event is full' },
          { status: 400 }
        )
      }
    }

    // Find or create participant
    // First, try to find via telegram identity
    const { data: telegramIdentity } = await supabase
      .from('telegram_identities')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    let participant = null

    // Try to find participant by tg_user_id if we have telegram identity
    if (telegramIdentity?.tg_user_id) {
      const { data: foundParticipant, error: findError } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('tg_user_id', telegramIdentity.tg_user_id)
        .maybeSingle()

      if (findError) {
        console.error('Error fetching participant by tg_user_id:', findError)
        return NextResponse.json(
          { error: 'Error fetching participant data' },
          { status: 500 }
        )
      }

      participant = foundParticipant
    }

    // If participant doesn't exist, create one using admin client to bypass RLS
    if (!participant) {
      const adminSupabase = createAdminServer()
      const { data: newParticipant, error: createError } = await adminSupabase
        .from('participants')
        .insert({
          org_id: event.org_id,
          tg_user_id: telegramIdentity?.tg_user_id || null,
          username: telegramIdentity?.username || null,
          full_name: telegramIdentity?.full_name || user.email || 'Unknown',
          source: 'event'
        })
        .select('id')
        .single()

      if (createError) {
        console.error('Error creating participant:', createError)
        return NextResponse.json(
          { error: 'Error creating participant' },
          { status: 500 }
        )
      }

      participant = newParticipant
    }

    // Check if already registered
    const { data: existingRegistration } = await supabase
      .from('event_registrations')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('participant_id', participant.id)
      .maybeSingle()

    if (existingRegistration) {
      if (existingRegistration.status === 'registered') {
        return NextResponse.json(
          { error: 'Already registered for this event' },
          { status: 400 }
        )
      }
      
      // Reactivate cancelled registration using admin client
      const adminSupabase = createAdminServer()
      const { data: registration, error: updateError } = await adminSupabase
        .from('event_registrations')
        .update({ 
          status: 'registered',
          registered_at: new Date().toISOString()
        })
        .eq('id', existingRegistration.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating registration:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ registration }, { status: 200 })
    }

    // Create new registration using admin client to bypass RLS
    const adminSupabase = createAdminServer()
    const { data: registration, error: registrationError } = await adminSupabase
      .from('event_registrations')
      .insert({
        event_id: eventId,
        participant_id: participant.id,
        registration_source: 'web',
        status: 'registered'
      })
      .select()
      .single()

    if (registrationError) {
      console.error('Error creating registration:', registrationError)
      return NextResponse.json(
        { error: registrationError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ registration }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/events/[id]/register:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/[id]/register - Unregister from event
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id
    const supabase = await createClientServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Find participant via telegram identity
    const { data: telegramIdentity } = await supabase
      .from('telegram_identities')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    let participant = null

    if (telegramIdentity?.tg_user_id) {
      const { data: foundParticipant, error: findError } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('tg_user_id', telegramIdentity.tg_user_id)
        .maybeSingle()

      if (findError) {
        console.error('Error fetching participant:', findError)
        return NextResponse.json(
          { error: 'Error fetching participant data' },
          { status: 500 }
        )
      }

      participant = foundParticipant
    }

    if (!participant) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }

    // Cancel registration using admin client
    const adminSupabase = createAdminServer()
    const { error: cancelError } = await adminSupabase
      .from('event_registrations')
      .update({ status: 'cancelled' })
      .eq('event_id', eventId)
      .eq('participant_id', participant.id)
      .eq('status', 'registered')

    if (cancelError) {
      console.error('Error cancelling registration:', cancelError)
      return NextResponse.json({ error: cancelError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/events/[id]/register:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

