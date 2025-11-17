import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

// GET /api/events/[id] - Get event details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()

    // Fetch event with registrations count
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        organizations(id, name),
        event_registrations!event_registrations_event_id_fkey(
          id,
          status,
          registered_at,
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

    // Calculate stats
    const registeredCount = event.event_registrations?.filter(
      (reg: any) => reg.status === 'registered'
    ).length || 0

    const availableSpots = event.capacity
      ? Math.max(0, event.capacity - registeredCount)
      : null

    // Check if current user is registered
    const { data: { user } } = await supabase.auth.getUser()
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
        available_spots: availableSpots,
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
      startTime,
      endTime,
      isPaid,
      priceInfo,
      capacity,
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
        { error: 'Only owners and admins can update events' },
        { status: 403 }
      )
    }

    // Update event
    const { data: event, error } = await supabase
      .from('events')
      .update({
        title,
        description: description || null,
        cover_image_url: coverImageUrl || null,
        event_type: eventType,
        location_info: locationInfo || null,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        is_paid: isPaid,
        price_info: priceInfo || null,
        capacity: capacity || null,
        status,
        is_public: isPublic,
        telegram_group_link: telegramGroupLink || null
      })
      .eq('id', eventId)
      .select()
      .single()

    if (error) {
      console.error('Error updating event:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id
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

