import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createAdminServer } from '@/lib/server/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()
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
    const { data: { user } } = await supabase.auth.getUser()
    
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
    const { data: registrations, error: regError } = await adminSupabase
      .from('event_registrations')
      .select(`
        id,
        registered_at,
        participants!inner (
          id,
          full_name,
          username,
          bio,
          photo_url,
          tg_user_id
        )
      `)
      .eq('event_id', eventId)
      .eq('status', 'registered')
      .order('registered_at', { ascending: true })

    if (regError) {
      console.error('Error fetching participants:', regError)
      return NextResponse.json({ error: regError.message }, { status: 500 })
    }

    // Transform data for frontend
    const participants = (registrations || []).map(reg => ({
      id: reg.participants.id,
      full_name: reg.participants.full_name || reg.participants.username || 'Участник',
      bio: reg.participants.bio || null,
      photo_url: reg.participants.photo_url || null,
      registered_at: reg.registered_at,
      // Include whether user is authenticated to control clickability
      is_authenticated: !!user
    }))

    return NextResponse.json({ participants }, { status: 200 })
  } catch (error: any) {
    console.error('Error in GET /api/events/[id]/participants:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

