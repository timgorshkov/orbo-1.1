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
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('*, event_registrations!event_registrations_event_id_fkey(id, status, payment_status, quantity)')
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

    // Parse request body for registration_data and quantity
    const body = await request.json().catch(() => ({}))
    const registrationData = body.registration_data || {}
    const quantity = Math.min(Math.max(parseInt(body.quantity) || 1, 1), 5) // Clamp between 1 and 5

    // Check capacity using helper function
    if (event.capacity) {
      const countByPaid = event.capacity_count_by_paid || false
      
      // Use helper function to count registrations
      const { data: countResult, error: countError } = await adminSupabase
        .rpc('get_event_registered_count', {
          event_uuid: eventId,
          count_by_paid: countByPaid
        })

      if (countError) {
        console.error('Error counting registrations:', countError)
        // Fallback to manual count
        let registeredCount = 0
        if (countByPaid) {
          registeredCount = event.event_registrations?.filter(
            (reg: any) => reg.status === 'registered' && reg.payment_status === 'paid'
          ).reduce((sum: number, reg: any) => sum + (reg.quantity || 1), 0) || 0
        } else {
          registeredCount = event.event_registrations?.filter(
            (reg: any) => reg.status === 'registered'
          ).reduce((sum: number, reg: any) => sum + (reg.quantity || 1), 0) || 0
        }
        
        if (registeredCount + quantity > event.capacity) {
          return NextResponse.json(
            { error: 'Event is full' },
            { status: 400 }
          )
        }
      } else {
        const currentCount = countResult || 0
        if (currentCount + quantity > event.capacity) {
          return NextResponse.json(
            { error: 'Event is full' },
            { status: 400 }
          )
        }
      }
    }

    // Find existing participant via user_telegram_accounts
    // First, get telegram account linked to this user
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id, telegram_username')
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

    // NEW: If not found by telegram_user_id, try finding by email
    // This prevents creating duplicate participants for users without confirmed Telegram
    if (!participant && user.email) {
      console.log(`Searching participant by email: ${user.email}`)
      
      const { data: foundByEmail } = await adminSupabase
        .from('participants')
        .select('id, tg_user_id')
        .eq('org_id', event.org_id)
        .eq('email', user.email)
        .is('merged_into', null)
        .maybeSingle()

      if (foundByEmail) {
        console.log(`Found existing participant by email: ${foundByEmail.id}`)
        participant = foundByEmail

        // If we found participant by email AND user now has confirmed Telegram,
        // update the participant with telegram_user_id
        if (telegramAccount?.telegram_user_id && !foundByEmail.tg_user_id) {
          console.log(`Linking telegram_user_id ${telegramAccount.telegram_user_id} to participant ${foundByEmail.id}`)
          
          await adminSupabase
            .from('participants')
            .update({ 
              tg_user_id: telegramAccount.telegram_user_id,
              username: telegramAccount.telegram_username
            })
            .eq('id', foundByEmail.id)
        }
      }
    }

    // If participant still not found, create a new one
    // This should only happen for first-time event registration
    if (!participant) {
      console.log(`Creating new participant for user ${user.id} in org ${event.org_id}`)
      
      const { data: newParticipant, error: createError } = await adminSupabase
        .from('participants')
        .insert({
          org_id: event.org_id,
          tg_user_id: telegramAccount?.telegram_user_id || null,
          username: telegramAccount?.telegram_username || null,
          full_name: user.email || 'Unknown',
          email: user.email,
          source: 'event',
          participant_status: 'event_attendee'
        })
        .select('id')
        .single()

      if (createError) {
        console.error('Error creating participant:', createError)
        
        // Handle duplicate email case (race condition or unique constraint)
        if (createError.code === '23505') {
          // Try to find the participant that was just created
          const { data: existingByEmail } = await adminSupabase
            .from('participants')
            .select('id')
            .eq('org_id', event.org_id)
            .eq('email', user.email)
            .is('merged_into', null)
            .maybeSingle()
          
          if (existingByEmail) {
            console.log(`Using participant created in race condition: ${existingByEmail.id}`)
            participant = existingByEmail
          } else {
            return NextResponse.json(
              { error: 'Error creating participant' },
              { status: 500 }
            )
          }
        } else {
          return NextResponse.json(
            { error: 'Error creating participant' },
            { status: 500 }
          )
        }
      } else {
        participant = newParticipant
      }
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
          registered_at: new Date().toISOString(),
          registration_data: registrationData,
          quantity: quantity
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
        status: 'registered',
        registration_data: registrationData,
        quantity: quantity
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
      .select('telegram_user_id, telegram_username')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    let participant = null

    // Try to find participant by telegram_user_id
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

    // Also try to find by email if not found by telegram
    if (!participant && user.email) {
      const { data: foundByEmail } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('email', user.email)
        .is('merged_into', null)
        .maybeSingle()

      participant = foundByEmail
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

