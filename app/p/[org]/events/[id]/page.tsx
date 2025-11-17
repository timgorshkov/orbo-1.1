import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventDetail from '@/components/events/event-detail'
import { Metadata } from 'next'
import { getEventOGImage, getAbsoluteOGImageUrl } from '@/lib/utils/ogImageFallback'

/**
 * Generate dynamic metadata for event pages (OG tags for Telegram sharing)
 */
export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ org: string; id: string }> 
}): Promise<Metadata> {
  const { org: orgId, id: eventId } = await params
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
    
    // Apply cascading OG image logic
    const ogImage = getEventOGImage(
      event.cover_image_url,
      org.logo_url
    )
    
    // Ensure absolute URL for OG image
    // If cover_image_url is from Supabase Storage, it's already absolute
    // If it's relative, make it absolute
    let absoluteOgImage: string
    if (ogImage.startsWith('http://') || ogImage.startsWith('https://')) {
      absoluteOgImage = ogImage
    } else {
      absoluteOgImage = getAbsoluteOGImageUrl(ogImage)
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
    
    return {
      title: `${event.title} | ${org.name}`,
      description,
      openGraph: {
        type: 'website',
        locale: 'ru_RU',
        url: `https://app.orbo.ru/p/${orgId}/events/${eventId}`,
        title: event.title,
        description,
        siteName: org.name,
        images: [
          {
            url: absoluteOgImage,
            width: 1200,
            height: 630,
            alt: event.title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: event.title,
        description,
        images: [absoluteOgImage],
      },
    }
  } catch (error) {
    console.error('Error generating event metadata:', error)
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

  // For private events, require org membership or show auth form
  // For public events, allow any authenticated user
  let hasOrgAccess = true;
  if (!event.is_public) {
    try {
      await requireOrgAccess(orgId, undefined, ['owner', 'admin', 'member', 'viewer'])
    } catch (error) {
      hasOrgAccess = false;
    }
  }
  
  // If user doesn't have access to private event, show auth form
  if (!hasOrgAccess) {
    // Import the auth page component
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
