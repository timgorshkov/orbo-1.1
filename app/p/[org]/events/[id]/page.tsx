import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventDetail from '@/components/events/event-detail'

export default async function EventDetailPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { org: orgId, id: eventId } = await params
  const { edit } = await searchParams
  
  const supabase = await createClientServer()
  const adminSupabase = createAdminServer()
  
  // Check authentication
  const { user } = await supabase.auth.getUser().then(res => res.data)
  if (!user) {
    redirect('/signin')
  }

  // Fetch event first to check if it's public
  const { data: event, error } = await adminSupabase
    .from('events')
    .select(`
      *,
      event_registrations!event_registrations_event_id_fkey(
        id,
        status,
        registered_at,
        participants!inner(
          id,
          full_name,
          username,
          tg_user_id,
          merged_into
        )
      )
    `)
    .eq('org_id', orgId)
    .eq('id', eventId)
    .single()

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

  // For private events, require org membership
  // For public events, allow any authenticated user
  if (!event.is_public) {
    try {
      await requireOrgAccess(orgId, undefined, ['owner', 'admin', 'member', 'viewer'])
    } catch (error) {
      return (
        <div className="p-6">
          <div className="text-center py-8">
            <h2 className="text-xl font-semibold mb-2">Доступ запрещен</h2>
            <p className="text-neutral-600">Это событие доступно только участникам сообщества.</p>
          </div>
        </div>
      )
    }
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
    .eq('org_id', orgId)
    .maybeSingle()

  const role = membership?.role || 'guest'
  
  console.log(`[Event Detail] User ${user.id} viewing event ${eventId} as ${role} (is_public: ${event.is_public})`)

  // Check if current user is registered
  // Find participant via user_telegram_accounts
  const { data: telegramAccount } = await supabase
    .from('user_telegram_accounts')
    .select('telegram_user_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
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
  if (role === 'owner' || role === 'admin') {
    // Загружаем группы через org_telegram_groups (new many-to-many schema)
    const { data: orgGroupsData } = await adminSupabase
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
    
    if (orgGroupsData) {
      // Извлекаем telegram_groups из результата JOIN и фильтруем по bot_status
      telegramGroups = (orgGroupsData as any[])
        .map((item: any) => item.telegram_groups)
        .filter((group: any) => group !== null && group.bot_status === 'connected')
        .sort((a: any, b: any) => {
          const titleA = a.title || ''
          const titleB = b.title || ''
          return titleA.localeCompare(titleB)
        })
    }
    
    console.log(`Loaded ${telegramGroups.length} connected telegram groups for event sharing`)
  }

  // Only allow edit mode for admins/owners
  const isAdmin = role === 'owner' || role === 'admin'
  const isEditMode = edit === 'true' && isAdmin

  return (
    <div className="p-6">
      <EventDetail 
        event={eventWithStats}
        orgId={orgId}
        role={role as 'owner' | 'admin' | 'member' | 'guest'}
        isEditMode={isEditMode}
        telegramGroups={telegramGroups}
      />
    </div>
  )
}
