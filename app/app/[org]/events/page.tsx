import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { createClientServer } from '@/lib/server/supabaseServer'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventsList from '@/components/events/events-list'

export default async function EventsPage({ params }: { params: { org: string } }) {
  const supabase = await createClientServer()
  
  // Check authentication and org access
  const { user } = await supabase.auth.getUser().then(res => res.data)
  if (!user) {
    redirect('/signin')
  }

  // Require org access (any member can view)
  await requireOrgAccess(params.org, ['owner', 'admin', 'member', 'viewer'])

  // Fetch events
    const { data: events, error } = await supabase
      .from('events')
    .select(`
      *,
      event_registrations!event_registrations_event_id_fkey(id, status)
    `)
      .eq('org_id', params.org)
    .order('event_date', { ascending: true })
    
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

  // Get user's role in org
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', params.org)
    .single()

  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'

  // Fetch telegram groups for notifications (admin only)
  let telegramGroups: any[] = []
  if (isAdmin) {
    const { data } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', params.org)
      .eq('bot_status', 'connected')
      .order('title')
    
    telegramGroups = data || []
  }
  
  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/events`} telegramGroups={[]}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">События</h1>
        </div>
        
      <Suspense fallback={<div className="text-center py-8">Загрузка...</div>}>
        <EventsList 
          events={eventsWithStats} 
          orgId={params.org}
          isAdmin={isAdmin}
          telegramGroups={telegramGroups}
        />
      </Suspense>
    </AppShell>
  )
}
