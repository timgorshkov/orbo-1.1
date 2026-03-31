import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import EventsList from '@/components/events/events-list'
import { createServiceLogger } from '@/lib/logger'
import { getPublicPortalAccess } from '@/lib/server/portalAccess'

export default async function EventsPage({ params }: { params: Promise<{ org: string }> }) {
  const logger = createServiceLogger('EventsPage');
  const { org: orgId } = await params
  const adminSupabase = createAdminServer()

  const access = await getPublicPortalAccess(orgId)
  if (!access) {
    redirect(`/p/${orgId}/auth`)
  }

  const role = access.role
  const isAdmin = role === 'owner' || role === 'admin'

  // Fetch all events (admins see all, members see published only)
  // Exclude recurring series parents — only child instances and standalone events are shown
  let eventsQuery = adminSupabase
    .from('events')
    .select('*')
    .eq('org_id', orgId)
    .order('event_date', { ascending: true })

  if (!isAdmin) {
    // Members see only published events
    eventsQuery = eventsQuery.eq('status', 'published')
  }

  const { data: allEvents, error } = await eventsQuery

  if (error) {
    logger.error({
      error: error.message,
      error_code: error.code,
      org_id: orgId
    }, 'Error fetching events');
  }

  // Hide recurring series parents from the calendar — navigate to them via child instance pages
  const events = (allEvents || []).filter(
    (e: any) => !(e.is_recurring && !e.parent_event_id)
  )

  // For registration counts: child instances look up their parent's registrations
  const regEventIds = [...new Set(events.map((e: any) => e.parent_event_id || e.id))]
  let registrationsMap = new Map<string, any[]>();

  if (regEventIds.length > 0) {
    const { data: registrations } = await adminSupabase
      .from('event_registrations')
      .select('id, status, event_id')
      .in('event_id', regEventIds);

    for (const reg of registrations || []) {
      const existing = registrationsMap.get(reg.event_id) || [];
      existing.push(reg);
      registrationsMap.set(reg.event_id, existing);
    }
  }

  // Per-instance opt-outs: count cancelled registrations on child event IDs
  const childEventIds = events.filter((e: any) => e.parent_event_id).map((e: any) => e.id)
  let instanceOptOutsMap = new Map<string, number>();

  if (childEventIds.length > 0) {
    const { data: optOuts } = await adminSupabase
      .from('event_registrations')
      .select('event_id')
      .in('event_id', childEventIds)
      .eq('status', 'cancelled');

    for (const opt of optOuts || []) {
      instanceOptOutsMap.set(opt.event_id, (instanceOptOutsMap.get(opt.event_id) || 0) + 1);
    }
  }

  // Build a map of parent events for cover image fallback
  const parentIds = [...new Set(events.filter((e: any) => e.parent_event_id).map((e: any) => e.parent_event_id))]
  const parentCovers = new Map<string, string | null>()
  if (parentIds.length > 0) {
    const { data: parents } = await adminSupabase
      .from('events')
      .select('id, cover_image_url')
      .in('id', parentIds)
    for (const p of parents || []) {
      parentCovers.set(p.id, p.cover_image_url)
    }
  }

  // Calculate stats for each event
  const eventsWithStats = events.map((event: any) => {
    // Children: registrations stored on parent, minus per-instance opt-outs
    const regEventId = event.parent_event_id || event.id
    const eventRegs = registrationsMap.get(regEventId) || [];
    const baseCount = eventRegs.filter(
      (reg: any) => reg.status === 'registered'
    ).length || 0
    const optOuts = event.parent_event_id ? (instanceOptOutsMap.get(event.id) || 0) : 0
    const registeredCount = Math.max(0, baseCount - optOuts)

    const availableSpots = event.capacity
      ? Math.max(0, event.capacity - registeredCount)
      : null

    // Children without cover: fall back to parent's cover
    const coverImageUrl = event.cover_image_url
      || (event.parent_event_id ? parentCovers.get(event.parent_event_id) : null)
      || null

    return {
      ...event,
      cover_image_url: coverImageUrl,
      registered_count: registeredCount,
      available_spots: availableSpots
    }
  })

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
  
  // p-3 on mobile, p-6 on sm+ — reduces wasted horizontal space on phones
  return (
    <div className="p-3 sm:p-6">
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

