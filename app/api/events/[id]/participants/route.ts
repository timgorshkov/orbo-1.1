import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

// GET /api/events/[id]/participants - Get public participants list
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/participants' });
  
  try {
    const { id: eventId } = await params;
    
    const supabase = await createClientServer()
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
        participants!inner (
          id,
          full_name,
          bio,
          photo_url,
          merged_into
        )
      `)
      .eq('event_id', eventId)
      .in('status', ['registered', 'attended'])
      .is('participants.merged_into', null)
      .order('registered_at', { ascending: true })
    
    // Check if user is authenticated to enable profile links
    const { data: { user } } = await supabase.auth.getUser()
    const isAuthenticated = !!user
    
    // Format response
    const participants = (registrations || []).map(reg => ({
      id: reg.participants.id,
      full_name: reg.participants.full_name || 'Участник',
      bio: reg.participants.bio,
      photo_url: reg.participants.photo_url,
      registered_at: reg.registered_at,
      is_authenticated: isAuthenticated
    }))
    
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
