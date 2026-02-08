import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

// POST /api/events/[id]/participants/[registrationId]/checkin - Manual check-in by admin
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/participants/[registrationId]/checkin' });
  
  try {
    const { id: eventId, registrationId } = await params;
    
    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get registration with event info
    const { data: registration } = await adminSupabase
      .from('event_registrations')
      .select('id, event_id, participant_id, status, checked_in_at, events(org_id)')
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .single()
    
    if (!registration) {
      logger.warn({ registration_id: registrationId }, 'Registration not found');
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }
    
    const event = registration.events as any
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    // Check that user is admin of the org
    const { data: member } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', event.org_id)
      .eq('user_id', user.id)
      .maybeSingle()
    
    const role = member?.role
    if (role !== 'owner' && role !== 'admin') {
      logger.warn({ user_id: user.id, org_id: event.org_id, role }, 'Non-admin attempted manual check-in');
      return NextResponse.json({ error: 'Forbidden — only admins can perform check-in' }, { status: 403 })
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
    
    // Perform check-in
    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminSupabase
      .from('event_registrations')
      .update({ 
        status: 'attended',
        checked_in_at: now
      })
      .eq('id', registrationId)
      .select()
      .single()
    
    if (updateError) {
      logger.error({ error: updateError.message, registration_id: registration.id }, 'Error updating checkin status');
      return NextResponse.json({ error: 'Failed to check in' }, { status: 500 })
    }
    
    logger.info({ 
      registration_id: registration.id,
      participant_id: registration.participant_id,
      event_id: eventId,
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
