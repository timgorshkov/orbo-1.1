import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAPILogger } from '@/lib/logger'

// GET /api/events/[id]/participants - Get public participants list
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/participants' });
  
  try {
    const { id: eventId } = await params;
    
    const adminSupabase = createAdminServer()
    
    // Get event first to check if participants list should be shown
    const { data: event } = await adminSupabase
      .from('events')
      .select('id, show_participants_list, org_id')
      .eq('id', eventId)
      .single()
    
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    // If participants list is hidden, return empty array
    if (!event.show_participants_list) {
      return NextResponse.json({ participants: [] })
    }
    
    // Get registrations with participant data
    // Include both 'registered' and 'attended' statuses
    const { data: registrations } = await adminSupabase
      .from('event_registrations')
      .select(`
        id,
        registered_at,
        participant_id,
        status
      `)
      .eq('event_id', eventId)
      .in('status', ['registered', 'attended'])
      .order('registered_at', { ascending: true })
    
    if (!registrations || registrations.length === 0) {
      return NextResponse.json({ participants: [] })
    }
    
    // Get participants separately
    const participantIds = registrations.map(r => r.participant_id).filter(Boolean)
    const { data: participantsData } = await adminSupabase
      .from('participants')
      .select('id, full_name, bio, photo_url')
      .in('id', participantIds)
      .is('merged_into', null)
    
    // Create map for quick lookup
    const participantsMap = new Map(
      (participantsData || []).map(p => [p.id, p])
    )
    
    // Check if user is authenticated and is admin (using unified auth)
    const user = await getUnifiedUser()
    const isAuthenticated = !!user
    
    let isAdmin = false
    if (user) {
      const { data: member } = await adminSupabase
        .from('memberships')
        .select('role')
        .eq('org_id', event.org_id)
        .eq('user_id', user.id)
        .maybeSingle()
      
      isAdmin = member?.role === 'owner' || member?.role === 'admin'
    }
    
    // Format response - filter out registrations without valid participants
    const participants = registrations
      .map(reg => {
        const participant = participantsMap.get(reg.participant_id)
        if (!participant) return null
        
        return {
          id: participant.id,
          registration_id: reg.id,
          full_name: participant.full_name || 'Участник',
          bio: participant.bio,
          photo_url: participant.photo_url,
          registered_at: reg.registered_at,
          status: reg.status,
          is_authenticated: isAuthenticated,
          is_admin: isAdmin
        }
      })
      .filter(Boolean)
    
    logger.info({ 
      event_id: eventId, 
      participants_count: participants.length,
      is_authenticated: isAuthenticated
    }, 'Participants list fetched');
    
    return NextResponse.json({ participants })
  } catch (error: any) {
    logger.error({ 
      error: error.message,
      stack: error.stack
    }, 'Error fetching participants');
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
