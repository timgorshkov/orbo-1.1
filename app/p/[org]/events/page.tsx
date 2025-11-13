import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import EventsList from '@/components/events/events-list'

export default async function EventsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const supabase = await createClientServer()
  const adminSupabase = createAdminServer()
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/p/${orgId}/auth`)
  }

  // Get user role
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership) {
    redirect(`/p/${orgId}`)
  }

  const role = membership.role
  const isAdmin = role === 'owner' || role === 'admin'

  // Fetch all events (admins see all, members see published only)
  let eventsQuery = adminSupabase
    .from('events')
    .select(`
      *,
      event_registrations!event_registrations_event_id_fkey(id, status)
    `)
    .eq('org_id', orgId)
    .order('event_date', { ascending: true })

  if (!isAdmin) {
    // Members see only published events
    eventsQuery = eventsQuery.eq('status', 'published')
  }

  const { data: events, error } = await eventsQuery
  
  if (error) {
    console.error('Error fetching events:', error)
  }
  
  // Calculate stats for each event
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
      event_registrations: undefined
    }
  }) || []

  // Fetch telegram groups for notifications (admin only)
  let telegramGroups: any[] = []
  if (isAdmin) {
    const { data: orgGroups } = await adminSupabase
      .from('org_telegram_groups')
      .select(`
        telegram_groups!inner (
          id,
          tg_chat_id,
          title,
          bot_status
        )
      `)
      .eq('org_id', orgId)
    
    if (orgGroups) {
      telegramGroups = orgGroups
        .map((og: any) => og.telegram_groups)
        .filter((g: any) => g !== null && g.bot_status === 'connected')
    }
  }
  
  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">События</h1>
        </div>
        
        <Suspense fallback={<div className="text-center py-8">Загрузка...</div>}>
          <EventsList 
            events={eventsWithStats}
            orgId={orgId}
            isAdmin={isAdmin}
            telegramGroups={telegramGroups}
          />
        </Suspense>
      </div>
    </div>
  )
}

