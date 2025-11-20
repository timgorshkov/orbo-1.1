import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

// GET /api/events - List events with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const status = searchParams.get('status')
    const publicOnly = searchParams.get('public') === 'true'
    
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 })
    }

    const supabase = await createClientServer()

    // Build query
    let query = supabase
      .from('events')
      .select(`
        *,
        event_registrations!event_registrations_event_id_fkey(id, status)
      `)
      .eq('org_id', orgId)
      .order('event_date', { ascending: true })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (publicOnly) {
      query = query.eq('is_public', true)
    }

    const { data: events, error } = await query

    if (error) {
      console.error('Error fetching events:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate registered count for each event
    const eventsWithStats = events?.map(event => {
      const registeredCount = event.event_registrations?.filter(
        (reg: any) => reg.status === 'registered'
      ).length || 0

      const availableSpots = event.capacity 
        ? Math.max(0, event.capacity - registeredCount)
        : null

      return {
        ...event,
        registered_count: registeredCount,
        available_spots: availableSpots,
        event_registrations: undefined // Remove registration details from list
      }
    })

    return NextResponse.json({ events: eventsWithStats })
  } catch (error: any) {
    console.error('Error in GET /api/events:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/events - Create new event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      orgId,
      title,
      description,
      coverImageUrl,
      eventType,
      locationInfo,
      eventDate,
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
      status,
      isPublic,
      telegramGroupLink
    } = body

    // Validation
    if (!orgId || !title || !eventType || !eventDate || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = await createClientServer()

    // Check if user has admin rights
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can create events' },
        { status: 403 }
      )
    }

    // Prepare event data
    const eventData: any = {
      org_id: orgId,
      title,
      description: description || null,
      cover_image_url: coverImageUrl || null,
      event_type: eventType,
      location_info: locationInfo || null,
      event_date: eventDate,
      start_time: startTime,
      end_time: endTime,
      capacity: capacity || null,
      capacity_count_by_paid: capacityCountByPaid !== undefined ? capacityCountByPaid : false,
      show_participants_list: showParticipantsList !== undefined ? showParticipantsList : true,
      allow_multiple_tickets: allowMultipleTickets !== undefined ? allowMultipleTickets : false,
      status: status || 'draft', // Use status from form, default to draft
      is_public: isPublic || false,
      telegram_group_link: telegramGroupLink || null,
      created_by: user.id
    }

    // Handle payment fields (support both old and new formats)
    if (requiresPayment !== undefined) {
      eventData.requires_payment = requiresPayment
      eventData.default_price = defaultPrice || null
      eventData.currency = currency || 'RUB'
      eventData.payment_deadline_days = paymentDeadlineDays !== undefined ? paymentDeadlineDays : 3
      eventData.payment_instructions = paymentInstructions || null
      
      // Also set old fields for backward compatibility
      eventData.is_paid = requiresPayment
      eventData.price_info = defaultPrice ? `${defaultPrice} ${currency || 'RUB'}` : null
    } else {
      // Old format (for backward compatibility)
      eventData.is_paid = isPaid || false
      eventData.price_info = priceInfo || null
    }

    // Create event
    const { data: event, error } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single()

    if (error) {
      console.error('Error creating event:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Create standard registration fields if requested
    if (requestContactInfo && event?.id) {
      const standardFields = [
        { field_key: 'full_name', field_label: 'Полное имя', field_type: 'text', is_required: true, display_order: 1, maps_to_participant_field: 'full_name' },
        { field_key: 'phone_number', field_label: 'Телефон', field_type: 'text', is_required: false, display_order: 2, maps_to_participant_field: 'phone_number' },
        { field_key: 'email', field_label: 'Email', field_type: 'email', is_required: false, display_order: 3, maps_to_participant_field: 'email' },
        { field_key: 'bio', field_label: 'Кратко о себе', field_type: 'textarea', is_required: false, display_order: 4, maps_to_participant_field: 'bio' }
      ]

      const fieldsToInsert = standardFields.map(field => ({
        ...field,
        event_id: event.id
      }))

      const { error: fieldsError } = await supabase
        .from('event_registration_fields')
        .insert(fieldsToInsert)

      if (fieldsError) {
        console.error('Error creating registration fields:', fieldsError)
        // Don't fail the entire request, just log the error
      }
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/events:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

