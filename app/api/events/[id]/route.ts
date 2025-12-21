import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// GET /api/events/[id] - Get event details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]' });
  let eventId: string | undefined;
  try {
    const paramsData = await params;
    eventId = paramsData.id;
    const adminSupabase = createAdminServer()
    
    // Fetch event with registrations
    const { data: event, error } = await adminSupabase
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
      logger.error({ error: error.message, event_id: eventId }, 'Error fetching event');
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check if current user is admin via unified auth
    const user = await getUnifiedUser()
    let isAdmin = false
    let paidCount = null

    if (user) {
      const { data: membership } = await adminSupabase
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

    // Check if current user is registered and get their payment status
    let isUserRegistered = false
    let userPaymentStatus: string | null = null

    if (user) {
      const { data: participant } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .limit(1)
        .single()

      if (participant) {
        const userRegistration = event.event_registrations?.find(
          (reg: any) => 
            reg.participants?.id === participant.id && 
            reg.status === 'registered'
        )
        isUserRegistered = !!userRegistration
        userPaymentStatus = userRegistration?.payment_status || null
      }
    }

    return NextResponse.json({
      event: {
        ...event,
        registered_count: registeredCount,
        paid_count: paidCount, // Only for admins, only for paid events
        available_spots: null, // Don't show available spots on public page (as per requirements)
        is_user_registered: isUserRegistered,
        user_payment_status: userPaymentStatus
      }
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      event_id: eventId || 'unknown'
    }, 'Error in GET /api/events/[id]');
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
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]' });
  let eventId: string | undefined;
  try {
    const paramsData = await params;
    eventId = paramsData.id;
    const body = await request.json()
    const {
      title,
      description,
      coverImageUrl,
      eventType,
      locationInfo,
      mapLink,
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
      paymentLink,
      capacity,
      capacityCountByPaid,
      showParticipantsList,
      allowMultipleTickets,
      // Registration fields config (JSONB)
      registrationFieldsConfig,
      status,
      isPublic,
      telegramGroupLink
    } = body

    const adminSupabase = createAdminServer()

    // Check if user has admin rights via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event to check org_id and current cover_image_url
    const { data: existingEvent, error: fetchError } = await adminSupabase
      .from('events')
      .select('org_id, cover_image_url')
      .eq('id', eventId)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights
    const { data: membership } = await adminSupabase
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
      map_link: eventType === 'offline' && mapLink ? mapLink : null,
      event_date: eventDate,
      end_date: endDate || null, // null means same day as event_date
      start_time: startTime,
      end_time: endTime,
      capacity: capacity || null,
      capacity_count_by_paid: capacityCountByPaid !== undefined ? capacityCountByPaid : false,
      show_participants_list: showParticipantsList !== undefined ? showParticipantsList : true,
      allow_multiple_tickets: allowMultipleTickets !== undefined ? allowMultipleTickets : false,
      registration_fields_config: registrationFieldsConfig || null,
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
      updateData.payment_link = paymentLink || null
      
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
      logger.error({ error: error.message, event_id: eventId, user_id: user.id }, 'Error updating event');
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log admin action
    await logAdminAction({
      orgId: existingEvent.org_id,
      userId: user.id,
      action: AdminActions.UPDATE_EVENT,
      resourceType: ResourceTypes.EVENT,
      resourceId: eventId,
      metadata: {
        title: event.title,
        event_type: event.event_type,
        status: event.status
      }
    })

    // Sync registration fields based on registrationFieldsConfig
    if (event?.id) {
      // First, delete all existing standard fields for this event
      await supabase
        .from('event_registration_fields')
        .delete()
        .eq('event_id', event.id)
        .in('field_key', ['full_name', 'phone_number', 'email', 'bio'])
      
      // If we have a config, create fields based on it
      if (registrationFieldsConfig) {
        const fieldsToInsert: any[] = []
        let order = 1
        
        // Field definitions with their default labels and types
        const fieldDefs: Record<string, { defaultLabel: string; fieldType: string; mapping: string }> = {
          full_name: { defaultLabel: 'Полное имя', fieldType: 'text', mapping: 'full_name' },
          phone_number: { defaultLabel: 'Телефон', fieldType: 'text', mapping: 'phone_number' },
          email: { defaultLabel: 'Email', fieldType: 'email', mapping: 'email' },
          bio: { defaultLabel: 'Кратко о себе', fieldType: 'textarea', mapping: 'bio' }
        }
        
        // Process each field in config
        for (const [fieldKey, configRaw] of Object.entries(registrationFieldsConfig)) {
          const config = configRaw as { status?: string; label?: string } | null
          if (config && config.status && config.status !== 'disabled' && fieldDefs[fieldKey]) {
            const def = fieldDefs[fieldKey]
            fieldsToInsert.push({
              event_id: event.id,
              field_key: fieldKey,
              field_label: config.label || def.defaultLabel,
              field_type: def.fieldType,
              required: config.status === 'required',
              field_order: order++,
              participant_field_mapping: def.mapping
            })
          }
        }
        
        // Insert enabled fields
        if (fieldsToInsert.length > 0) {
          const { error: fieldsError } = await supabase
            .from('event_registration_fields')
            .insert(fieldsToInsert)
          
          if (fieldsError) {
            logger.error({ error: fieldsError.message, event_id: event.id }, 'Error creating registration fields');
          }
        }
      }
    }

    return NextResponse.json({ event })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      event_id: eventId
    }, 'Error in PUT /api/events/[id]');
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
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]' });
  let eventId: string | undefined;
  try {
    const paramsData = await params;
    eventId = paramsData.id;
    const adminSupabase = createAdminServer()

    // Check if user has admin rights via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event to check org_id
    const { data: existingEvent, error: fetchError } = await adminSupabase
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights
    const { data: membership } = await adminSupabase
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
      logger.error({ error: error.message, event_id: eventId, user_id: user.id }, 'Error deleting event');
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log admin action
    await logAdminAction({
      orgId: existingEvent.org_id,
      userId: user.id,
      action: AdminActions.DELETE_EVENT,
      resourceType: ResourceTypes.EVENT,
      resourceId: eventId,
      metadata: {}
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      event_id: eventId || 'unknown'
    }, 'Error in DELETE /api/events/[id]');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

