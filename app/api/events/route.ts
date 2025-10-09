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
      capacity,
      isPublic
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

    // Create event
    const { data: event, error } = await supabase
      .from('events')
      .insert({
        org_id: orgId,
        title,
        description: description || null,
        cover_image_url: coverImageUrl || null,
        event_type: eventType,
        location_info: locationInfo || null,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        is_paid: isPaid || false,
        price_info: priceInfo || null,
        capacity: capacity || null,
        status: 'draft',
        is_public: isPublic || false,
        created_by: user.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating event:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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

