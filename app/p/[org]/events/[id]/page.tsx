import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventDetail from '@/components/events/event-detail'
import { Metadata } from 'next'
import { getEventOGImage, getAbsoluteOGImageUrl } from '@/lib/utils/ogImageFallback'
import { createServiceLogger } from '@/lib/logger'
import { RequestTiming } from '@/lib/utils/timing'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

/**
 * Generate dynamic metadata for event pages (OG tags for Telegram sharing)
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ org: string; id: string }> 
}): Promise<Metadata> {
  const { org: orgId, id: eventId } = await params

  if (!UUID_RE.test(eventId) || !UUID_RE.test(orgId)) {
    return { title: 'Событие не найдено' }
  }

  const adminSupabase = createAdminServer()
  
  try {
    // Fetch event and organization
    const { data: event } = await adminSupabase
      .from('events')
      .select(`
        id,
        title,
        description,
        cover_image_url,
        event_type,
        event_date,
        start_time,
        is_public
      `)
      .eq('id', eventId)
      .single()
    
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id, name, logo_url')
      .eq('id', orgId)
      .single()
    
    if (!event || !org) {
      return {
        title: 'Событие не найдено',
      }
    }
    
    // Apply cascading OG image logic (event cover → org logo → null)
    const ogImage = getEventOGImage(
      event.cover_image_url,
      org.logo_url
    )
    
    // Ensure absolute URL for OG image (if exists)
    let absoluteOgImage: string | null = null
    if (ogImage) {
      if (ogImage.startsWith('http://') || ogImage.startsWith('https://')) {
        absoluteOgImage = ogImage
      } else {
        absoluteOgImage = getAbsoluteOGImageUrl(ogImage)
      }
    }
    
    // Format event date
    const eventDate = event.event_date 
      ? new Date(event.event_date).toLocaleDateString('ru-RU', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        })
      : ''
    
    const eventTime = event.start_time?.substring(0, 5) || ''
    
    // Create description: prefer event description, fallback to structured info
    let description: string
    if (event.description && event.description.trim().length > 0) {
      // Use event description, but truncate if too long (OG limit ~200 chars)
      description = event.description.length > 200 
        ? event.description.substring(0, 197) + '...'
        : event.description
    } else {
      // Fallback: structured description
      const parts = [
        event.event_type === 'online' ? 'Онлайн' : 'Оффлайн',
        'событие',
        eventDate && `на ${eventDate}`,
        eventTime && `в ${eventTime}`,
        `от ${org.name}`
      ].filter(Boolean)
      description = parts.join(' ')
    }
    
    // Build openGraph config
    const openGraphConfig: any = {
      type: 'website',
      locale: 'ru_RU',
      url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/p/${orgId}/events/${eventId}`,
      title: event.title,
      description,
      siteName: org.name,
    }
    
    // Only include images if we have one (event cover or org logo)
    if (absoluteOgImage) {
      openGraphConfig.images = [
        {
          url: absoluteOgImage,
          width: 1200,
          height: 630,
          alt: event.title,
        },
      ]
    }
    
    // Build twitter config
    const twitterConfig: any = {
      card: absoluteOgImage ? 'summary_large_image' : 'summary',
      title: event.title,
      description,
    }
    
    if (absoluteOgImage) {
      twitterConfig.images = [absoluteOgImage]
    }
    
    return {
      title: `${event.title} | ${org.name}`,
      description,
      openGraph: openGraphConfig,
      twitter: twitterConfig,
    }
  } catch (error) {
    const logger = createServiceLogger('EventDetailPage');
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      event_id: eventId,
      org_id: orgId
    }, 'Error generating event metadata');
    return {
      title: 'Событие',
    }
  }
}

export default async function EventDetailPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const timing = new RequestTiming('EventDetailPage');
  const { org: orgId, id: eventId } = await params
  const { edit } = await searchParams
  
  if (!UUID_RE.test(eventId) || !UUID_RE.test(orgId)) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold mb-2">Событие не найдено</h2>
          <p className="text-neutral-600">Это событие не существует или было удалено.</p>
        </div>
      </div>
    )
  }

  const adminSupabase = createAdminServer()
  const logger = createServiceLogger('EventDetailPage');
  
  // Fetch event FIRST to check if it's public (before auth check)
  timing.mark('fetch_event_start');
  
  // Получаем событие
  const { data: eventBase, error } = await adminSupabase
    .from('events')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', eventId)
    .single();
  
  let event = eventBase as any;
  
  if (eventBase && !error) {
    // Получаем регистрации
    const { data: registrations } = await adminSupabase
      .from('event_registrations')
      .select('id, status, registered_at, payment_status, paid_amount, quantity, price, registration_data, participant_id')
      .eq('event_id', eventId);
    
    if (registrations && registrations.length > 0) {
      // Получаем участников
      const participantIds = registrations.map(r => r.participant_id).filter(Boolean);
      const { data: participants } = await adminSupabase
        .from('participants')
        .select('id, full_name, username, email, phone, bio, tg_user_id, merged_into')
        .in('id', participantIds);
      
      const participantsMap = new Map(participants?.map(p => [p.id, p]) || []);
      
      // Объединяем в JS
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
  
  timing.mark('fetch_event_end');
  timing.measure('fetch_event', 'fetch_event_start', 'fetch_event_end');

  if (error) {
    logger.error({
      error: error.message,
      error_code: error.code,
      event_id: eventId,
      org_id: orgId
    }, 'Error fetching event');
  }

  if (error || !event) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold mb-2">Событие не найдено</h2>
          <p className="text-neutral-600">Это событие не существует или было удалено.</p>
          {error && (
            <p className="text-xs text-red-600 mt-2">Код ошибки: {error.code}</p>
          )}
        </div>
      </div>
    )
  }

  // Check authentication via unified auth
  timing.mark('check_auth_start');
  const user = await getUnifiedUser();
  timing.mark('check_auth_end');
  timing.measure('check_auth', 'check_auth_start', 'check_auth_end');
  const isAuthenticated = !!user
  
  // For PUBLIC events: show event details to everyone (auth required only for registration)
  // For PRIVATE events: require authentication and org membership
  
  if (!isAuthenticated) {
    if (event.is_public) {
      // Public event - show event details without auth (read-only mode)
      // Registration will require auth (handled in EventDetail component)
      const eventWithStats = {
        ...event,
        registered_count: event.event_registrations?.filter(
          (reg: any) => (reg.status === 'registered' || reg.status === 'attended') && reg.participants?.merged_into === null
        ).length || 0,
        available_spots: event.capacity
          ? Math.max(0, event.capacity - (event.event_registrations?.filter(
              (reg: any) => (reg.status === 'registered' || reg.status === 'attended') && reg.participants?.merged_into === null
            ).length || 0))
          : null,
        is_user_registered: false
      }
      
      return (
        <div className="p-6">
          <EventDetail 
            event={eventWithStats}
            orgId={orgId}
            role="guest"
            isEditMode={false}
            telegramGroups={[]}
            requireAuthForRegistration={true}
          />
        </div>
      )
    } else {
      // Private event - redirect to auth
      redirect(`/p/${orgId}/auth?redirect=${encodeURIComponent(`/p/${orgId}/events/${eventId}`)}`)
    }
  }

  // User is authenticated - check org access for private events
  const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
  let hasOrgAccess = true;
  if (!event.is_public) {
    // Check membership (with superadmin fallback)
    timing.mark('check_org_access_start');
    const accessCheck = await getEffectiveOrgRole(user.id, orgId);
    timing.mark('check_org_access_end');
    timing.measure('check_org_access', 'check_org_access_start', 'check_org_access_end');
    
    hasOrgAccess = !!accessCheck
  }
  
  // If user doesn't have access to private event, show auth form
  if (!hasOrgAccess) {
    // Fetch org name for display
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single()
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Доступ ограничен
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Это событие доступно только участникам сообщества <strong>{org?.name}</strong>
              </p>
            </div>
            
            <div className="space-y-4">
              <a
                href={`/p/${orgId}/auth?redirect=${encodeURIComponent(`/p/${orgId}/events/${eventId}`)}`}
                className="block w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-center"
              >
                Войти через Telegram
              </a>
              
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Для доступа к событию необходимо быть участником сообщества. 
                Используйте Telegram для входа.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Calculate stats (exclude merged participants)
  const registeredCount = event.event_registrations?.filter(
    (reg: any) => (reg.status === 'registered' || reg.status === 'attended') && reg.participants?.merged_into === null
  ).length || 0

  const availableSpots = event.capacity
    ? Math.max(0, event.capacity - registeredCount)
    : null

  // Check user's role (with superadmin fallback)
  timing.mark('fetch_membership_start');
  const membershipAccess = await getEffectiveOrgRole(user.id, orgId);
  timing.mark('fetch_membership_end');
  timing.measure('fetch_membership', 'fetch_membership_start', 'fetch_membership_end');

  const role = membershipAccess?.role || 'guest'
  
  logger.debug({
    user_id: user.id,
    event_id: eventId,
    role,
    is_public: event.is_public,
    org_id: orgId
  }, 'User viewing event');

  // Check if current user is registered
  // Find participant via user_telegram_accounts
  timing.mark('fetch_tg_account_start');
  const { data: telegramAccount } = await adminSupabase
    .from('user_telegram_accounts')
    .select('telegram_user_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle();
  timing.mark('fetch_tg_account_end');
  timing.measure('fetch_tg_account', 'fetch_tg_account_start', 'fetch_tg_account_end');

  let participant: { id: string } | null = null
  if (telegramAccount?.telegram_user_id) {
    timing.mark('find_participant_start');
    const { data: foundParticipant } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('tg_user_id', telegramAccount.telegram_user_id)
      .is('merged_into', null)
      .maybeSingle();
    timing.mark('find_participant_end');
    timing.measure('find_participant', 'find_participant_start', 'find_participant_end');
    
    participant = foundParticipant
  } else if (user.email) {
    // Fallback: try finding by email
    timing.mark('find_participant_start');
    const { data: foundByEmail } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('email', user.email)
      .is('merged_into', null)
      .maybeSingle();
    timing.mark('find_participant_end');
    timing.measure('find_participant', 'find_participant_start', 'find_participant_end');
    
    participant = foundByEmail
  }

  const isUserRegistered = participant && event.event_registrations?.some(
    (reg: any) => 
      reg.participants?.id === participant.id && 
      (reg.status === 'registered' || reg.status === 'attended')
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
    timing.mark('fetch_tg_groups_start');
    const { data: orgGroupLinks } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId);
    
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
        });
    }
    timing.mark('fetch_tg_groups_end');
    timing.measure('fetch_tg_groups', 'fetch_tg_groups_start', 'fetch_tg_groups_end');
    
    logger.debug({
      group_count: telegramGroups.length,
      event_id: eventId,
      org_id: orgId
    }, 'Loaded connected telegram groups for event sharing');
  }
  
  // Log timing summary (only if > 200ms for debugging)
  timing.logSummary(logger, 200);

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
