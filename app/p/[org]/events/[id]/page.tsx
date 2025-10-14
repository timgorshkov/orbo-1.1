import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminServer } from '@/lib/server/supabaseServer'
import PublicEventDetail from '@/components/events/public-event-detail'
import AccessDeniedWithAuth from '@/components/events/access-denied-with-auth'

export default async function PublicEventPage({ params }: { params: { org: string; id: string } }) {
  const supabase = createAdminServer()

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

  // Check access rights by reading cookies directly (without modification)
  // This prevents "Cookies can only be modified in a Server Action" error
  const cookieStore = await cookies()
  
  // Try to find Supabase auth token in cookies
  let userId: string | null = null
  
  // Check for auth token (Next.js + Supabase can store it in different formats)
  const allCookies = cookieStore.getAll()
  const authCookie = allCookies.find(c => 
    c.name.includes('auth-token') || 
    c.name === 'sb-access-token' ||
    c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  )
  
  if (authCookie?.value) {
    try {
      // Try to parse as JSON first (Supabase v2 format)
      const authData = JSON.parse(authCookie.value)
      userId = authData?.user?.id || authData?.access_token ? 
        JSON.parse(Buffer.from(authData.access_token.split('.')[1], 'base64').toString()).sub : null
    } catch {
      try {
        // Try as JWT token directly
        const payload = JSON.parse(Buffer.from(authCookie.value.split('.')[1], 'base64').toString())
        userId = payload.sub
      } catch (err) {
        console.error('Error decoding auth cookie:', err)
      }
    }
  }
  
  let isOrgMember = false
  
  if (userId) {
    console.log(`[PublicEventPage] Checking membership for userId: ${userId}, orgId: ${org.id}`)
    
    // Check if user is a member of this organization
    const { data: telegramAccount, error: taError } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', userId)
      .eq('org_id', org.id)
      .maybeSingle()
    
    console.log(`[PublicEventPage] telegramAccount:`, telegramAccount, 'error:', taError)
    
    if (telegramAccount) {
      const { data: participant, error: pError } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', org.id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .maybeSingle()
      
      console.log(`[PublicEventPage] participant:`, participant, 'error:', pError)
      
      isOrgMember = !!participant
    } else {
      // Try to find participant by user_id directly (backup check)
      console.log(`[PublicEventPage] No telegram account found, checking participants directly`)
      const { data: directParticipant } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', org.id)
        .eq('user_id', userId)
        .maybeSingle()
      
      console.log(`[PublicEventPage] directParticipant:`, directParticipant)
      isOrgMember = !!directParticipant
    }
  }
  
  console.log(`[PublicEventPage] Final isOrgMember: ${isOrgMember}`)
  
  // If event is NOT public and user is NOT a member, show access denied with auth option
  if (!event.is_public && !isOrgMember) {
    return (
      <AccessDeniedWithAuth
        orgId={org.id}
        orgName={org.name}
        eventId={params.id}
        isAuthenticated={!!userId}
      />
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
      isAuthenticated={!!userId}
      isOrgMember={isOrgMember}
    />
  )
}
