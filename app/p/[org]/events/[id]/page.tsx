import { redirect } from 'next/navigation'
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer'
import PublicEventDetail from '@/components/events/public-event-detail'

export default async function PublicEventPage({ params }: { params: { org: string; id: string } }) {
  const supabase = await createAdminServer()
  const clientSupabase = await createClientServer()

  // Get organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', params.org)
    .single()

  if (orgError || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Организация не найдена</h1>
          <p className="text-neutral-600">Эта организация не существует или была удалена.</p>
        </div>
      </div>
    )
  }

  // Fetch event
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(`
      *,
      event_registrations!event_registrations_event_id_fkey(id, status)
    `)
    .eq('id', params.id)
    .eq('org_id', org.id)
    .single()

  if (eventError || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Событие не найдено</h1>
          <p className="text-neutral-600">Это событие не существует или было удалено.</p>
        </div>
      </div>
    )
  }

  // Check access rights
  const { data: { user } } = await clientSupabase.auth.getUser()
  
  let isOrgMember = false
  if (user) {
    // Check if user is a member of this organization
    // by checking if their Telegram account is linked to any participant in this org
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .single()
    
    if (telegramAccount) {
      const { data: participant } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', org.id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .single()
      
      isOrgMember = !!participant
    }
  }
  
  // If event is NOT public and user is NOT a member, show access denied
  if (!event.is_public && !isOrgMember) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ ограничен</h1>
          <p className="text-neutral-600 mb-4">Это событие доступно только участникам пространства.</p>
          {!user && (
            <p className="text-sm text-neutral-500">
              Войдите через Telegram, если вы участник группы.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Check if event is published
  if (event.status !== 'published') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Событие недоступно</h1>
          <p className="text-neutral-600">Это событие еще не опубликовано.</p>
        </div>
      </div>
    )
  }

  // Calculate stats
  const registeredCount = event.event_registrations?.filter(
    (reg: any) => reg.status === 'registered'
  ).length || 0

  const availableSpots = event.capacity
    ? Math.max(0, event.capacity - registeredCount)
    : null

  const eventWithStats = {
    ...event,
    registered_count: registeredCount,
    available_spots: availableSpots,
    event_registrations: undefined
  }

  return (
    <PublicEventDetail 
      event={eventWithStats}
      org={org}
      isAuthenticated={!!user}
      isOrgMember={isOrgMember}
    />
  )
}
