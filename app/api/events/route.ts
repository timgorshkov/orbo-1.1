import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createEventReminders } from '@/lib/services/announcementService'

// GET /api/events - List events with filters
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/events' });
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const status = searchParams.get('status')
    const publicOnly = searchParams.get('public') === 'true'
    
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 })
    }

    const adminSupabase = createAdminServer()

    // Build query - простой запрос без JOIN
    let query = adminSupabase
      .from('events')
      .select('*')
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
      logger.error({ error: error.message, org_id: orgId }, 'Error fetching events');
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Получаем регистрации отдельно
    const eventIds = events?.map(e => e.id) || [];
    let registrationsMap = new Map<string, any[]>();
    
    if (eventIds.length > 0) {
      const { data: registrations } = await adminSupabase
        .from('event_registrations')
        .select('id, status, event_id')
        .in('event_id', eventIds);
      
      // Группируем регистрации по event_id
      for (const reg of registrations || []) {
        const existing = registrationsMap.get(reg.event_id) || [];
        existing.push(reg);
        registrationsMap.set(reg.event_id, existing);
      }
    }

    // Calculate registered count for each event
    const eventsWithStats = events?.map(event => {
      const eventRegistrations = registrationsMap.get(event.id) || [];
      const registeredCount = eventRegistrations.filter(
        (reg: any) => reg.status === 'registered'
      ).length || 0

      const availableSpots = event.capacity 
        ? Math.max(0, event.capacity - registeredCount)
        : null

      return {
        ...event,
        registered_count: registeredCount,
        available_spots: availableSpots
      }
    })

    return NextResponse.json({ events: eventsWithStats })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in GET /api/events');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/events - Create new event
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/events' });
  try {
    const body = await request.json()
    const {
      orgId,
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

    // Validation
    if (!orgId || !title || !eventType || !eventDate || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminServer()

    // Check if user has admin rights via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await adminSupabase
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
      eventData.payment_link = paymentLink || null
      
      // Also set old fields for backward compatibility
      eventData.is_paid = requiresPayment
      eventData.price_info = defaultPrice ? `${defaultPrice} ${currency || 'RUB'}` : null
    } else {
      // Old format (for backward compatibility)
      eventData.is_paid = isPaid || false
      eventData.price_info = priceInfo || null
    }

    // Create event
    const { data: event, error } = await adminSupabase
      .from('events')
      .insert(eventData)
      .select()
      .single()

    if (error) {
      logger.error({ error: error.message, org_id: orgId, user_id: user.id }, 'Error creating event');
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.CREATE_EVENT,
      resourceType: ResourceTypes.EVENT,
      resourceId: event.id,
      metadata: {
        title: event.title,
        event_type: event.event_type,
        event_date: event.event_date,
        status: event.status
      }
    })

    // Create registration fields based on config
    if (registrationFieldsConfig && event?.id) {
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
        const { error: fieldsError } = await adminSupabase
          .from('event_registration_fields')
          .insert(fieldsToInsert)
        
        if (fieldsError) {
          logger.error({ error: fieldsError.message, event_id: event.id }, 'Error creating registration fields');
          // Don't fail the entire request, just log the error
        }
      }
    }

    // Create auto-announcements (reminders) for the event
    // Only for future events with event_date set
    if (event?.id && event.event_date) {
      try {
        // Get all org groups for announcements (via org_telegram_groups -> telegram_groups)
        const { data: orgGroups } = await adminSupabase
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', orgId)
          .eq('status', 'active');
        
        if (orgGroups && orgGroups.length > 0) {
          // target_groups stores tg_chat_id (BIGINT[]) for the announcements table
          const targetGroups = orgGroups.map(g => String(g.tg_chat_id));
          
          if (targetGroups.length > 0) {
            await createEventReminders(
              event.id,
              orgId,
              event.title,
              event.description,
              new Date(event.event_date),
              event.location_info,
              targetGroups
            );
            logger.info({ event_id: event.id, targetGroupsCount: targetGroups.length }, 'Event reminders created');
          }
        }
      } catch (reminderError: any) {
        logger.warn({ 
          error: reminderError.message, 
          event_id: event.id 
        }, 'Failed to create event reminders (non-critical)');
      }
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in POST /api/events');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

