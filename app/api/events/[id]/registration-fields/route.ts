import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

// GET /api/events/[id]/registration-fields - Get registration fields for an event
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()

    // Get event to check if it's published (for public access)
    const { data: event } = await supabase
      .from('events')
      .select('id, status, org_id')
      .eq('id', eventId)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check access: either event is published OR user is admin
    const { data: { user } } = await supabase.auth.getUser()
    let canAccess = event.status === 'published'

    if (!canAccess && user) {
      // Check if user is admin
      const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', event.org_id)
        .single()

      canAccess = membership?.role === 'owner' || membership?.role === 'admin'
    }

    if (!canAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Fetch registration fields
    const { data: fields, error } = await supabase
      .from('event_registration_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching registration fields:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Map database field names to frontend expected names
    const mappedFields = (fields || []).map(field => ({
      id: field.id,
      event_id: field.event_id,
      field_key: field.field_key,
      field_label: field.field_label,
      field_type: field.field_type,
      required: field.is_required,
      field_order: field.display_order,
      participant_field_mapping: field.maps_to_participant_field,
      options: field.options
    }))

    return NextResponse.json({ fields: mappedFields })
  } catch (error: any) {
    console.error('Error in GET /api/events/[id]/registration-fields:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/events/[id]/registration-fields - Create a new registration field
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()
    const supabaseAdmin = createAdminServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event and check admin rights
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('org_id')
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
        { error: 'Only admins can manage registration fields' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      field_key,
      field_label,
      field_type,
      required = false,
      field_order = 0,
      participant_field_mapping,
      options
    } = body

    // Validate required fields
    if (!field_key || !field_label || !field_type) {
      return NextResponse.json(
        { error: 'field_key, field_label, and field_type are required' },
        { status: 400 }
      )
    }

    // Validate field_type
    const validTypes = ['text', 'email', 'phone', 'textarea', 'select', 'checkbox']
    if (!validTypes.includes(field_type)) {
      return NextResponse.json(
        { error: `field_type must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate options for select/checkbox
    if ((field_type === 'select' || field_type === 'checkbox') && !options) {
      return NextResponse.json(
        { error: 'options is required for select and checkbox fields' },
        { status: 400 }
      )
    }

    // Create field using admin client
    const { data: field, error: createError } = await supabaseAdmin
      .from('event_registration_fields')
      .insert({
        event_id: eventId,
        field_key,
        field_label,
        field_type,
        is_required: required,
        display_order: field_order,
        maps_to_participant_field: participant_field_mapping || null,
        options: options || null
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating registration field:', createError)
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    return NextResponse.json({ field }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/events/[id]/registration-fields:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/events/[id]/registration-fields - Update registration fields order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()
    const supabaseAdmin = createAdminServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event and check admin rights
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('org_id')
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
        { error: 'Only admins can manage registration fields' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { fields } = body // Array of {id, field_order} or full field updates

    if (!Array.isArray(fields)) {
      return NextResponse.json(
        { error: 'fields must be an array' },
        { status: 400 }
      )
    }

    // Update fields using admin client
    const updates = fields.map((field: any) => {
      const updateData: any = {}
      if (field.field_order !== undefined) updateData.display_order = field.field_order
      if (field.field_label !== undefined) updateData.field_label = field.field_label
      if (field.required !== undefined) updateData.is_required = field.required
      if (field.participant_field_mapping !== undefined) {
        updateData.maps_to_participant_field = field.participant_field_mapping
      }
      if (field.options !== undefined) updateData.options = field.options
      updateData.updated_at = new Date().toISOString()

      return supabaseAdmin
        .from('event_registration_fields')
        .update(updateData)
        .eq('id', field.id)
        .eq('event_id', eventId)
    })

    await Promise.all(updates)

    // Fetch updated fields
    const { data: updatedFields } = await supabaseAdmin
      .from('event_registration_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })

    // Map database field names to frontend expected names
    const mappedFields = (updatedFields || []).map(field => ({
      id: field.id,
      event_id: field.event_id,
      field_key: field.field_key,
      field_label: field.field_label,
      field_type: field.field_type,
      required: field.is_required,
      field_order: field.display_order,
      participant_field_mapping: field.maps_to_participant_field,
      options: field.options
    }))

    return NextResponse.json({ fields: mappedFields })
  } catch (error: any) {
    console.error('Error in PUT /api/events/[id]/registration-fields:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/[id]/registration-fields?fieldId=... - Delete a registration field
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const { searchParams } = new URL(request.url)
    const fieldId = searchParams.get('fieldId')

    if (!fieldId) {
      return NextResponse.json(
        { error: 'fieldId query parameter is required' },
        { status: 400 }
      )
    }
    const supabase = await createClientServer()
    const supabaseAdmin = createAdminServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event and check admin rights
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('org_id')
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
        { error: 'Only admins can delete registration fields' },
        { status: 403 }
      )
    }

    // Delete field using admin client
    const { error: deleteError } = await supabaseAdmin
      .from('event_registration_fields')
      .delete()
      .eq('id', fieldId)
      .eq('event_id', eventId)

    if (deleteError) {
      console.error('Error deleting registration field:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/events/[id]/registration-fields:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

