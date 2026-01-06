import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// POST /api/events/[id]/participants - Manually add participant to event (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/participants' });
  try {
    const { id: eventId } = await params
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event details
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('org_id, status')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin permissions
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { org_id, full_name, email, phone, bio } = body

    if (!full_name || !full_name.trim()) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    }

    if (org_id !== event.org_id) {
      return NextResponse.json({ error: 'Organization mismatch' }, { status: 400 })
    }

    // Find or create participant
    let participantId: string | null = null

    // Try to find existing participant by email first
    if (email) {
      const { data: existingByEmail } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('email', email.trim())
        .is('merged_into', null)
        .maybeSingle()

      if (existingByEmail) {
        participantId = existingByEmail.id
        logger.debug({ participant_id: participantId, email }, '[Add Participant] Found existing participant by email');
      }
    }

    // If not found by email, try by phone
    if (!participantId && phone) {
      const { data: existingByPhone } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('phone', phone.trim())
        .is('merged_into', null)
        .maybeSingle()

      if (existingByPhone) {
        participantId = existingByPhone.id
        logger.debug({ participant_id: participantId, phone }, '[Add Participant] Found existing participant by phone');
      }
    }

    // If not found, create a "shadow" participant
    if (!participantId) {
      logger.info({ full_name, event_id: eventId }, '[Add Participant] Creating shadow participant');
      
      const { data: newParticipant, error: createError } = await adminSupabase
        .from('participants')
        .insert({
          org_id: event.org_id,
          full_name: full_name.trim(),
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          bio: bio?.trim() || null,
          source: 'admin',
          participant_status: 'event_attendee'
        })
        .select('id')
        .single()

      if (createError) {
        logger.error({ error: createError.message, full_name, event_id: eventId }, '[Add Participant] Error creating participant');
        
        // Handle duplicate email/phone case
        if (createError.code === '23505') {
          // Try to find the participant that was just created
          if (email) {
            const { data: existingByEmail } = await adminSupabase
              .from('participants')
              .select('id')
              .eq('org_id', event.org_id)
              .eq('email', email.trim())
              .is('merged_into', null)
              .maybeSingle()
            
            if (existingByEmail) {
              participantId = existingByEmail.id
              logger.debug({ participant_id: participantId }, '[Add Participant] Using participant created in race condition (email)');
            }
          }
          
          if (!participantId && phone) {
            const { data: existingByPhone } = await adminSupabase
              .from('participants')
              .select('id')
              .eq('org_id', event.org_id)
              .eq('phone', phone.trim())
              .is('merged_into', null)
              .maybeSingle()
            
            if (existingByPhone) {
              participantId = existingByPhone.id
              logger.debug({ participant_id: participantId }, '[Add Participant] Using participant created in race condition (phone)');
            }
          }
          
          if (!participantId) {
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
        participantId = newParticipant.id
      }
    } else {
      // Update existing participant with new data (only if fields are empty)
      const { data: existingParticipant } = await adminSupabase
        .from('participants')
        .select('full_name, email, phone, bio')
        .eq('id', participantId)
        .single()

      if (existingParticipant) {
        const updates: any = {}
        
        if (!existingParticipant.full_name && full_name) {
          updates.full_name = full_name.trim()
        }
        if (!existingParticipant.email && email) {
          updates.email = email.trim()
        }
        if (!existingParticipant.phone && phone) {
          updates.phone = phone.trim()
        }
        if (!existingParticipant.bio && bio) {
          updates.bio = bio.trim()
        }

        if (Object.keys(updates).length > 0) {
          await adminSupabase
            .from('participants')
            .update(updates)
            .eq('id', participantId)
        }
      }
    }

    // Check if already registered
    const { data: existingRegistration } = await adminSupabase
      .from('event_registrations')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('participant_id', participantId)
      .maybeSingle()

    if (existingRegistration) {
      if (existingRegistration.status === 'registered') {
        return NextResponse.json(
          { error: 'Participant is already registered for this event' },
          { status: 400 }
        )
      }
      
      // Reactivate cancelled registration
      const { error: updateError } = await adminSupabase
        .from('event_registrations')
        .update({ 
          status: 'registered',
          registered_at: new Date().toISOString(),
          registration_source: 'admin',
          registration_data: {
            full_name: full_name.trim(),
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            bio: bio?.trim() || null
          }
        })
        .eq('id', existingRegistration.id)

      if (updateError) {
        logger.error({ error: updateError.message, registration_id: existingRegistration.id }, '[Add Participant] Error updating registration');
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true,
        message: 'Participant added successfully',
        registration_id: existingRegistration.id
      }, { status: 200 })
    }

    // Register participant using RPC function
    const { data: registrationResult, error: rpcError } = await adminSupabase
      .rpc('register_for_event', {
        p_event_id: eventId,
        p_participant_id: participantId,
        p_registration_data: {
          full_name: full_name.trim(),
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          bio: bio?.trim() || null
        },
        p_quantity: 1
      })

    if (rpcError) {
      logger.error({ error: rpcError.message, event_id: eventId, participant_id: participantId }, '[Add Participant] RPC error');
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    // Update registration_source to 'admin' (RPC defaults to 'web')
    if (registrationResult && registrationResult.length > 0) {
      const registrationId = registrationResult[0].registration_id
      
      await adminSupabase
        .from('event_registrations')
        .update({ registration_source: 'admin' })
        .eq('id', registrationId)
    }

    return NextResponse.json({ 
      success: true,
      message: 'Participant added successfully',
      registration_id: registrationResult?.[0]?.registration_id
    }, { status: 200 })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in POST /api/events/[id]/participants');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/participants' });
  try {
    const { id: eventId } = await params
    const adminSupabase = createAdminServer()

    // Get event details
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('org_id, status, is_public, show_participants_list')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check if participants list should be shown
    if (!event.show_participants_list) {
      return NextResponse.json({ participants: [] }, { status: 200 })
    }

    // Check if event is accessible
    const user = await getUnifiedUser()
    
    // Public events are accessible to everyone
    // Private events require membership
    if (!event.is_public || event.status !== 'published') {
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Check membership
      const { data: membership } = await adminSupabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', event.org_id)
        .maybeSingle()

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Get registered participants
    const { data: registrationsRaw, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('id, registered_at, registration_data, participant_id')
      .eq('event_id', eventId)
      .eq('status', 'registered')
    
    // Получаем данные участников
    let registrations: any[] = [];
    if (registrationsRaw && registrationsRaw.length > 0) {
      const participantIds = registrationsRaw.map(r => r.participant_id).filter(Boolean);
      const { data: participants } = await adminSupabase
        .from('participants')
        .select('id, full_name, username, bio, photo_url, tg_user_id')
        .in('id', participantIds);
      
      const participantsMap = new Map(participants?.map(p => [p.id, p]) || []);
      registrations = registrationsRaw.filter(r => participantsMap.has(r.participant_id)).map(r => ({
        ...r,
        participants: participantsMap.get(r.participant_id)
      }));
    }

    if (regError) {
      logger.error({ error: regError.message, event_id: eventId }, 'Error fetching participants');
      return NextResponse.json({ error: regError.message }, { status: 500 })
    }

    logger.debug({ 
      registrations_count: registrations?.length || 0,
      event_id: eventId
    }, '[Event Participants] Found registrations');
    
    // Transform data for frontend
    const participants = (registrations || [])
      .map(reg => {
        const participant = reg.participants;
        
        if (!participant) {
          logger.debug({ registration_id: reg.id }, '[Event Participants] Skipping registration with no participant data');
          return null
        }
        
        // Use registration_data if available, otherwise fallback to participant profile
        const regData = reg.registration_data || {}
        const displayBio = regData.bio || participant.bio || null
        const displayFullName = regData.full_name || participant.full_name || participant.username || 'Участник'
        
        return {
          id: participant.id,
          full_name: displayFullName,
          bio: displayBio,
          photo_url: participant.photo_url || null,
          registered_at: reg.registered_at,
          // Include whether user is authenticated to control clickability
          is_authenticated: !!user
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    logger.debug({ 
      participants_count: participants.length,
      event_id: eventId
    }, '[Event Participants] Returning participants');
    
    return NextResponse.json({ participants }, { status: 200 })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in GET /api/events/[id]/participants');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

