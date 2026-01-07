import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import EventsList from '@/components/events/events-list'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export default async function EventsPage({ params }: { params: Promise<{ org: string }> }) {
  const logger = createServiceLogger('EventsPage');
  const { org: orgId } = await params
  const adminSupabase = createAdminServer()
  
  // Check authentication via unified auth (supports both Supabase and NextAuth)
  const user = await getUnifiedUser()
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
    .select('*')
    .eq('org_id', orgId)
    .order('event_date', { ascending: true })

  if (!isAdmin) {
    // Members see only published events
    eventsQuery = eventsQuery.eq('status', 'published')
  }

  const { data: events, error } = await eventsQuery
  
  if (error) {
    logger.error({
      error: error.message,
      error_code: error.code,
      org_id: orgId
    }, 'Error fetching events');
  }
  
  // Получаем регистрации отдельно
  const eventIds = events?.map(e => e.id) || [];
  let registrationsMap = new Map<string, any[]>();
  
  if (eventIds.length > 0) {
    const { data: registrations } = await adminSupabase
      .from('event_registrations')
      .select('id, status, event_id')
      .in('event_id', eventIds);
    
    for (const reg of registrations || []) {
      const existing = registrationsMap.get(reg.event_id) || [];
      existing.push(reg);
      registrationsMap.set(reg.event_id, existing);
    }
  }
  
  // Calculate stats for each event
  const eventsWithStats = events?.map(event => {
    const eventRegs = registrationsMap.get(event.id) || [];
    const registeredCount = eventRegs.filter(
      (reg: any) => reg.status === 'registered'
    ).length || 0

    const availableSpots = event.capacity 
      ? Math.max(0, event.capacity - registeredCount)
      : null

    return {
      ...event,
      registered_count: registeredCount,
      available_spots: availableSpots
    }
  }) || []

  // Fetch telegram groups for notifications (admin only)
  let telegramGroups: any[] = []
  if (isAdmin) {
    const { data: orgGroupLinks } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)
    
    if (orgGroupLinks && orgGroupLinks.length > 0) {
      const chatIds = orgGroupLinks.map(link => link.tg_chat_id);
      const { data: groups } = await adminSupabase
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status')
        .in('tg_chat_id', chatIds)
      
      telegramGroups = groups?.filter(g => g.bot_status === 'connected') || []
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
            role={role as 'owner' | 'admin' | 'member' | 'guest'}
            telegramGroups={telegramGroups}
          />
        </Suspense>
      </div>
    </div>
  )
}

