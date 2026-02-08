import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAPILogger } from '@/lib/logger'

// POST /api/events/[id]/participants/[registrationId]/checkin - Manual check-in by admin
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/participants/[registrationId]/checkin' });
  
  try {
    const { id: eventId, registrationId } = await params;
    
    const adminSupabase = createAdminServer()
    
    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      logger.warn({ event_id: eventId, registration_id: registrationId }, 'Unauthorized checkin attempt - no user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    logger.info({ 
      user_id: user.id, 
      event_id: eventId, 
      registration_id: registrationId 
    }, 'Checkin attempt by user');
    
    // Step 1: Get the event to find org_id (separate query, no joins)
    const { data: eventData, error: eventError } = await adminSupabase
      .from('events')
      .select('id, org_id')
      .eq('id', eventId)
      .single()
    
    if (eventError || !eventData) {
      logger.warn({ event_id: eventId, error: eventError?.message }, 'Event not found for checkin');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    // Step 2: Check that user is admin of the org
    const { data: member, error: memberError } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', eventData.org_id)
      .eq('user_id', user.id)
      .maybeSingle()
    
    logger.info({ 
      user_id: user.id, 
      org_id: eventData.org_id, 
      role: member?.role,
      member_found: !!member,
      member_error: memberError?.message
    }, 'Membership check for checkin');
    
    const role = member?.role
    if (role !== 'owner' && role !== 'admin') {
      logger.warn({ user_id: user.id, org_id: eventData.org_id, role }, 'Non-admin attempted manual check-in');
      return NextResponse.json({ error: 'Forbidden — only admins can perform check-in' }, { status: 403 })
    }
    
    // Step 3: Get the registration (separate query, no joins)
    const { data: registration, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('id, event_id, participant_id, status, checked_in_at')
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .single()
    
    if (regError || !registration) {
      logger.warn({ 
        registration_id: registrationId, 
        event_id: eventId, 
        error: regError?.message 
      }, 'Registration not found for checkin');
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }
    
    // Check if already checked in
    if (registration.status === 'attended') {
      logger.info({ registration_id: registration.id }, 'Already checked in');
      return NextResponse.json({ 
        success: true,
        already_checked_in: true,
        checked_in_at: registration.checked_in_at,
        message: 'Participant already checked in'
      })
    }
    
    // Step 4: Perform check-in
    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminSupabase
      .from('event_registrations')
      .update({ 
        status: 'attended',
        checked_in_at: now
      })
      .eq('id', registrationId)
      .select('id, status, checked_in_at')
      .single()
    
    if (updateError) {
      logger.error({ error: updateError.message, registration_id: registration.id }, 'Error updating checkin status');
      return NextResponse.json({ error: 'Failed to check in' }, { status: 500 })
    }
    
    logger.info({ 
      registration_id: registration.id,
      participant_id: registration.participant_id,
      event_id: eventId,
      org_id: eventData.org_id,
      checked_in_by: user.id,
      manual_checkin: true
    }, 'Manual check-in successful');
    
    return NextResponse.json({ 
      success: true,
      already_checked_in: false,
      checked_in_at: now,
      message: 'Check-in successful'
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message,
      stack: error.stack
    }, 'Manual checkin error');
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
