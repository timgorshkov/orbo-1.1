import { redirect } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventDetail from '@/components/events/event-detail'

export default async function EventDetailPage({ 
  params,
  searchParams 
}: { 
  params: { org: string; id: string }
  searchParams: { edit?: string }
}) {
  const supabase = await createClientServer()
  
  // Check authentication
  const { user } = await supabase.auth.getUser().then(res => res.data)
  if (!user) {
    redirect('/signin')
  }

  // Require org access
  await requireOrgAccess(params.org, undefined, ['owner', 'admin', 'member', 'viewer'])

  const adminSupabase = createAdminServer()

  // Fetch event using admin client to avoid RLS issues after access check
  const { data: event, error } = await adminSupabase
    .from('events')
    .select(`
      *,
      event_registrations!event_registrations_event_id_fkey(
        id,
        status,
        registered_at,
        participants(
          id,
          full_name,
          username,
          tg_user_id
        )
      )
    `)
    .eq('org_id', params.org)
    .eq('id', params.id)
    .single()

  if (error || !event) {
    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/events`} telegramGroups={[]}>
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold mb-2">Событие не найдено</h2>
          <p className="text-neutral-600">Это событие не существует или было удалено.</p>
        </div>
      </AppShell>
    )
  }

  // Calculate stats
  const registeredCount = event.event_registrations?.filter(
    (reg: any) => reg.status === 'registered'
  ).length || 0

  const availableSpots = event.capacity
    ? Math.max(0, event.capacity - registeredCount)
    : null

  // Check user's role
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', params.org)
    .single()

  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'

  // Check if current user is registered
  // Find participant via telegram identity
  const { data: telegramIdentity } = await supabase
    .from('telegram_identities')
    .select('tg_user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let participant = null
  if (telegramIdentity?.tg_user_id) {
    const { data: foundParticipant } = await supabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('tg_user_id', telegramIdentity.tg_user_id)
      .maybeSingle()
    
    participant = foundParticipant
  }

  const isUserRegistered = participant && event.event_registrations?.some(
    (reg: any) => 
      reg.participants?.id === participant.id && 
      reg.status === 'registered'
  )

  const eventWithStats = {
    ...event,
    registered_count: registeredCount,
    available_spots: availableSpots,
    is_user_registered: isUserRegistered || false
  }

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

  const isEditMode = searchParams.edit === 'true'

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/events`} telegramGroups={[]}>
      <EventDetail 
        event={eventWithStats}
        orgId={params.org}
        isAdmin={isAdmin}
        isEditMode={isEditMode && isAdmin}
        telegramGroups={telegramGroups}
      />
    </AppShell>
  )
}

