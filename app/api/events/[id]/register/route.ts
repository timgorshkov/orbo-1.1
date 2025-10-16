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
    const adminSupabase = createAdminServer()

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

    // Find existing participant via user_telegram_accounts
    // First, get telegram account linked to this user
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    let participant = null

    // Try to find participant by telegram_user_id (only canonical, not merged)
    if (telegramAccount?.telegram_user_id) {
      const { data: foundParticipant } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()

      participant = foundParticipant
    }

    // If participant still not found, this is an edge case
    // Only create if no participant exists for this user in this org
    if (!participant) {
      console.log(`Creating new participant for user ${user.id} in org ${event.org_id}`)
      
      const { data: newParticipant, error: createError } = await adminSupabase
        .from('participants')
        .insert({
          org_id: event.org_id,
          tg_user_id: telegramAccount?.telegram_user_id || null,
          full_name: user.email || 'Unknown',
          email: user.email,
          source: 'event',
          participant_status: 'event_attendee'
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
      
      // Handle duplicate key error gracefully
      if (registrationError.code === '23505') {
        // User is already registered (race condition)
        const { data: existingReg } = await adminSupabase
          .from('event_registrations')
          .select('*')
          .eq('event_id', eventId)
          .eq('participant_id', participant.id)
          .single()
        
        return NextResponse.json(
          { 
            registration: existingReg,
            message: 'Already registered' 
          },
          { status: 200 }
        )
      }
      
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
    const adminSupabase = createAdminServer()

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

    // Find participant via user_telegram_accounts
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    let participant = null

    if (telegramAccount?.telegram_user_id) {
      const { data: foundParticipant } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()

      participant = foundParticipant
    }

    if (!participant) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }

    // Cancel registration using admin client
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

