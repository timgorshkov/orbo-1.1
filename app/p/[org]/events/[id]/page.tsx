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
      event_registrations!event_registrations_event_id_fkey(
        id, 
        status,
        participants!inner(merged_into)
      )
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
      const { data: participants, error: pError } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', org.id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null) // Exclude merged participants
        .limit(1)
      
      console.log(`[PublicEventPage] participants:`, participants, 'error:', pError)
      
      isOrgMember = !!(participants && participants.length > 0)
    } else {
      // Try to find participant by user_id directly (backup check)
      console.log(`[PublicEventPage] No telegram account found, checking participants directly`)
      const { data: directParticipants } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', org.id)
        .eq('user_id', userId)
        .is('merged_into', null) // Exclude merged participants
        .limit(1)
      
      console.log(`[PublicEventPage] directParticipants:`, directParticipants)
      isOrgMember = !!(directParticipants && directParticipants.length > 0)
    }
  }
  
  console.log(`[PublicEventPage] Final isOrgMember: ${isOrgMember}`)
  
  // If user is authenticated and is org member, redirect to internal page with navigation
  if (userId && isOrgMember) {
    redirect(`/app/${org.id}/events/${params.id}`)
  }
  
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

  // Calculate stats (exclude merged participants)
  const registeredCount = event.event_registrations?.filter(
    (reg: any) => reg.status === 'registered' && reg.participants?.merged_into === null
  ).length || 0

  const availableSpots = event.capacity
    ? Math.max(0, event.capacity - registeredCount)
    : null

  // Check if current user is registered
  let isUserRegistered = false
  let participant = null
  
  if (userId) {
    // Find participant via user_telegram_accounts
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', userId)
      .eq('org_id', org.id)
      .maybeSingle()

    if (telegramAccount?.telegram_user_id) {
      const { data: foundParticipant } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', org.id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()
      
      participant = foundParticipant
    } else {
      // Fallback: try finding by email (fetch user to get email)
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const { data: foundByEmail } = await supabase
          .from('participants')
          .select('id')
          .eq('org_id', org.id)
          .eq('email', user.email)
          .is('merged_into', null)
          .maybeSingle()
        
        participant = foundByEmail
      }
    }

    if (participant) {
      isUserRegistered = event.event_registrations?.some(
        (reg: any) => 
          reg.participants?.id === participant.id && 
          reg.status === 'registered'
      ) || false
    }
  }

  const eventWithStats = {
    ...event,
    registered_count: registeredCount,
    available_spots: availableSpots,
    is_user_registered: isUserRegistered,
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
