import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'

// GET /api/events/[id] - Get event details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()

    const adminSupabase = createAdminServer()
    
    // Fetch event with registrations
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        organizations(id, name),
        event_registrations!event_registrations_event_id_fkey(
          id,
          status,
          registered_at,
          payment_status,
          quantity,
          participants(
            id,
            full_name,
            username,
            tg_user_id
          )
        )
      `)
      .eq('id', eventId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }
      console.error('Error fetching event:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser()
    let isAdmin = false
    let paidCount = null

    if (user) {
      const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', event.org_id)
        .single()

      isAdmin = membership?.role === 'owner' || membership?.role === 'admin'
    }

    // Calculate registered count using helper function (includes quantity)
    const countByPaid = event.capacity_count_by_paid || false
    const { data: registeredCountResult } = await adminSupabase
      .rpc('get_event_registered_count', {
        event_uuid: eventId,
        count_by_paid: false // Always count all registered for display
      })

    const registeredCount = registeredCountResult || 0

    // For admins, also calculate paid count if event requires payment
    if (isAdmin && event.requires_payment) {
      const { data: paidCountResult } = await adminSupabase
        .rpc('get_event_registered_count', {
          event_uuid: eventId,
          count_by_paid: true
        })
      paidCount = paidCountResult || 0
    }

    // Check if current user is registered
    let isUserRegistered = false

    if (user) {
      const { data: participant } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .limit(1)
        .single()

      if (participant) {
        isUserRegistered = event.event_registrations?.some(
          (reg: any) => 
            reg.participants?.id === participant.id && 
            reg.status === 'registered'
        ) || false
      }
    }

    return NextResponse.json({
      event: {
        ...event,
        registered_count: registeredCount,
        paid_count: paidCount, // Only for admins, only for paid events
        available_spots: null, // Don't show available spots on public page (as per requirements)
        is_user_registered: isUserRegistered
      }
    })
  } catch (error: any) {
    console.error('Error in GET /api/events/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/events/[id] - Update event
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const body = await request.json()
    const {
      title,
      description,
      coverImageUrl,
      eventType,
      locationInfo,
      eventDate,
      endDate,
      startTime,
      endTime,
      isPaid,
      priceInfo,
      // New payment fields
      requiresPayment,
      defaultPrice,
      currency,
      paymentDeadlineDays,
      paymentInstructions,
      capacity,
      capacityCountByPaid,
      showParticipantsList,
      allowMultipleTickets,
      requestContactInfo,
      requireAllContactFields,
      status,
      isPublic,
      telegramGroupLink
    } = body

    const supabase = await createClientServer()

    // Check if user has admin rights
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event to check org_id and current cover_image_url
    const { data: existingEvent, error: fetchError } = await supabase
      .from('events')
      .select('org_id, cover_image_url')
      .eq('id', eventId)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', existingEvent.org_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can update events' },
        { status: 403 }
      )
    }

    // Delete old cover image if it's being replaced or removed, and it's from our bucket
    if (existingEvent.cover_image_url && 
        existingEvent.cover_image_url !== coverImageUrl &&
        existingEvent.cover_image_url.includes('/event-covers/')) {
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      const urlParts = existingEvent.cover_image_url.split('/event-covers/')
      if (urlParts.length > 1) {
        const oldPath = urlParts[1].split('?')[0] // Remove query params
        await adminSupabase.storage
          .from('event-covers')
          .remove([oldPath])
      }
    }

    // Update event
    const updateData: any = {
      title,
      description: description || null,
      cover_image_url: coverImageUrl || null,
      event_type: eventType,
      location_info: locationInfo || null,
      event_date: eventDate,
      end_date: endDate || null, // null means same day as event_date
      start_time: startTime,
      end_time: endTime,
      capacity: capacity || null,
      capacity_count_by_paid: capacityCountByPaid !== undefined ? capacityCountByPaid : false,
      show_participants_list: showParticipantsList !== undefined ? showParticipantsList : true,
      allow_multiple_tickets: allowMultipleTickets !== undefined ? allowMultipleTickets : false,
      status,
      is_public: isPublic,
      telegram_group_link: telegramGroupLink || null
    }

    // Handle payment fields (support both old and new formats)
    if (requiresPayment !== undefined) {
      updateData.requires_payment = requiresPayment
      updateData.default_price = defaultPrice || null
      updateData.currency = currency || 'RUB'
      updateData.payment_deadline_days = paymentDeadlineDays !== undefined ? paymentDeadlineDays : 3
      updateData.payment_instructions = paymentInstructions || null
      
      // Also update old fields for backward compatibility
      updateData.is_paid = requiresPayment
      updateData.price_info = defaultPrice ? `${defaultPrice} ${currency || 'RUB'}` : null
    } else if (isPaid !== undefined) {
      // Old format (for backward compatibility)
      updateData.is_paid = isPaid
      updateData.price_info = priceInfo || null
    }

    const { data: event, error } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventId)
      .select()
      .single()

    if (error) {
      console.error('Error updating event:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Create/update standard registration fields if requested
    if (requestContactInfo && event?.id) {
      // If requireAllContactFields is true, all fields are required
      const allRequired = requireAllContactFields === true
      
      // First check if fields already exist
      const { data: existingFields } = await supabase
        .from('event_registration_fields')
        .select('field_key')
        .eq('event_id', event.id)

      const existingFieldKeys = existingFields?.map(f => f.field_key) || []
      
      const standardFields = [
        { field_key: 'full_name', field_label: 'Полное имя', field_type: 'text', required: true, field_order: 1, participant_field_mapping: 'full_name' },
        { field_key: 'phone_number', field_label: 'Телефон', field_type: 'text', required: allRequired, field_order: 2, participant_field_mapping: 'phone_number' },
        { field_key: 'email', field_label: 'Email', field_type: 'email', required: allRequired, field_order: 3, participant_field_mapping: 'email' },
        { field_key: 'bio', field_label: 'Кратко о себе', field_type: 'textarea', required: allRequired, field_order: 4, participant_field_mapping: 'bio' }
      ]

      // Insert new fields
      const fieldsToInsert = standardFields
        .filter(field => !existingFieldKeys.includes(field.field_key))
        .map(field => ({
          ...field,
          event_id: event.id
        }))

      if (fieldsToInsert.length > 0) {
        const { error: fieldsError } = await supabase
          .from('event_registration_fields')
          .insert(fieldsToInsert)

        if (fieldsError) {
          console.error('Error creating registration fields:', fieldsError)
        }
      }

      // Update required status for existing fields if requireAllContactFields changed
      if (existingFieldKeys.length > 0) {
        const { error: updateError } = await supabase
          .from('event_registration_fields')
          .update({ required: allRequired })
          .eq('event_id', event.id)
          .neq('field_key', 'full_name') // full_name is always required

        if (updateError) {
          console.error('Error updating registration field requirements:', updateError)
        }
      }
    }

    return NextResponse.json({ event })
  } catch (error: any) {
    console.error('Error in PUT /api/events/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/[id] - Delete event
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()

    // Check if user has admin rights
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event to check org_id
    const { data: existingEvent, error: fetchError } = await supabase
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', existingEvent.org_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can delete events' },
        { status: 403 }
      )
    }

    // Delete event (will cascade to registrations)
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (error) {
      console.error('Error deleting event:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/events/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

