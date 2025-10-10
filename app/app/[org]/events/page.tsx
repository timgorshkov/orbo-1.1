import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'
import { getUserRoleInOrg } from '@/lib/auth/getUserRole'
import EventsList from '@/components/events/events-list'

export default async function EventsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const supabase = await createClientServer()
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?redirect=/app/${orgId}/events`)
  }

  // Get user role
  const role = await getUserRoleInOrg(user.id, orgId)
  if (role === 'guest') {
    redirect('/orgs')
  }

  const isAdmin = role === 'owner' || role === 'admin'

  // Fetch all events (admins see all, members see published only)
  let eventsQuery = supabase
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
    const { data } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', orgId)
      .eq('bot_status', 'connected')
      .order('title')
    
    telegramGroups = data || []
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
