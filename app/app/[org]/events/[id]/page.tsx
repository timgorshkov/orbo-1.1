import { redirect } from 'next/navigation'

export default async function OldEventDetailPageRedirect({ 
  params,
  searchParams 
}: { 
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { org, id } = await params
  const { edit } = await searchParams
  
  const editParam = edit === 'true' ? '?edit=true' : ''
  redirect(`/p/${org}/events/${id}${editParam}`)
}

/*
// Old implementation - redirects to new /p/ structure
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
  await requireOrgAccess(params.org, ['owner', 'admin', 'member', 'viewer'])

  const adminSupabase = createAdminServer()

  // Fetch event using admin client to avoid RLS issues after access check
  const { data: eventBase, error } = await adminSupabase
    .from('events')
    .select('*')
    .eq('org_id', params.org)
    .eq('id', params.id)
    .single()
  
  let event = eventBase as any;
  
  if (eventBase && !error) {
    // Получаем регистрации
    const { data: registrations } = await adminSupabase
      .from('event_registrations')
      .select('id, status, registered_at, participant_id')
      .eq('event_id', params.id);
    
    if (registrations && registrations.length > 0) {
      const participantIds = registrations.map(r => r.participant_id).filter(Boolean);
      const { data: participants } = await adminSupabase
        .from('participants')
        .select('id, full_name, username, tg_user_id, merged_into')
        .in('id', participantIds);
      
      const participantsMap = new Map(participants?.map(p => [p.id, p]) || []);
      
      event = {
        ...eventBase,
        event_registrations: registrations.map(r => ({
          ...r,
          participants: participantsMap.get(r.participant_id) || null
        }))
      };
    } else {
      event = { ...eventBase, event_registrations: [] };
    }
  }

  if (error || !event) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold mb-2">Событие не найдено</h2>
          <p className="text-neutral-600">Это событие не существует или было удалено.</p>
        </div>
      </div>
    )
  }

  // Calculate stats (exclude merged participants)
  const registeredCount = event.event_registrations?.filter(
    (reg: any) => reg.status === 'registered' && reg.participants?.merged_into === null
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
  // Find participant via user_telegram_accounts
  const { data: telegramAccount } = await supabase
    .from('user_telegram_accounts')
    .select('telegram_user_id')
    .eq('user_id', user.id)
    .eq('org_id', params.org)
    .maybeSingle()

  let participant: { id: string } | null = null
  if (telegramAccount?.telegram_user_id) {
    const { data: foundParticipant } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('tg_user_id', telegramAccount.telegram_user_id)
      .is('merged_into', null)
      .maybeSingle()
    
    participant = foundParticipant
  } else if (user.email) {
    // Fallback: try finding by email
    const { data: foundByEmail } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('email', user.email)
      .is('merged_into', null)
      .maybeSingle()
    
    participant = foundByEmail
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
    // Загружаем группы через org_telegram_groups
    const { data: orgGroupLinks } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', params.org)
    
    if (orgGroupLinks && orgGroupLinks.length > 0) {
      const chatIds = orgGroupLinks.map(link => link.tg_chat_id);
      const { data: groups } = await adminSupabase
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status')
        .in('tg_chat_id', chatIds);
      
      telegramGroups = (groups || [])
        .filter((group: any) => group.bot_status === 'connected')
        .sort((a: any, b: any) => {
          const titleA = a.title || ''
          const titleB = b.title || ''
          return titleA.localeCompare(titleB)
        })
    }
    
    console.log(`Loaded ${telegramGroups.length} connected telegram groups for event sharing`)
  }

  const isEditMode = searchParams.edit === 'true'

  return (
    <div className="p-6">
      <EventDetail 
        event={eventWithStats}
        orgId={params.org}
        isAdmin={isAdmin}
        isEditMode={isEditMode && isAdmin}
        telegramGroups={telegramGroups}
      />
    </div>
  )
}
*/
