/**
 * Home Page Data Fetcher
 * Aggregates all data needed for the participant home page
 */

import { createAdminServer } from './supabaseServer'
import { createServiceLogger } from '@/lib/logger'

export interface HomePageData {
  organization: {
    id: string
    name: string
    logo_url: string | null
    public_description: string | null
    portal_cover_url: string | null
    member_count: number
    event_count: number
    material_count: number
  }

  portalSettings: {
    show_events: boolean
    show_members: boolean
    show_materials: boolean
    show_apps: boolean
    welcome_html: string | null
  }
  
  currentParticipant?: {
    id: string
    full_name: string
    username: string | null
    avatar_url: string | null
    joined_at: string
    days_in_community: number
    events_attended: number
    last_active_at: string
    is_newcomer: boolean  // < 7 days
    is_inactive: boolean  // > 14 days no activity
  }
  
  upcomingEvents: Array<{
    id: string
    title: string
    description: string | null
    cover_image_url: string | null
    event_date: string
    start_time: string
    event_type: 'online' | 'offline'
    location_info: string | null
    registered_count: number
    is_user_registered: boolean
  }>
  
  myEventRegistrations: Array<{
    event_id: string
    event_title: string
    event_date: string
    start_time: string
    registered_at: string
    days_until_event: number
  }>
  
  recentMembers: Array<{
    id: string
    full_name: string
    username: string | null
    avatar_url: string | null
    joined_at: string
  }>

  recentMaterials: Array<{
    id: string
    title: string
    updated_at: string
  }>

  recentApps: Array<{
    id: string
    name: string
    description: string | null
    icon: string | null
  }>

  activitySummary?: {  // только если is_inactive
    new_events_count: number
    new_members_count: number
    new_materials_count: number
    since: string
  }
}

// ── Helper: org-level data without participant ────────────────────────────────

async function getOrgOnlyHomePageData(
  supabase: ReturnType<typeof createAdminServer>,
  org: any,
  orgId: string,
  logger: ReturnType<typeof createServiceLogger>
): Promise<HomePageData> {
  const now = new Date()

  const [
    { count: memberCount },
    { count: eventCount },
    { count: materialCount },
    { data: upcomingEvents },
    { data: recentMembersRaw },
    { data: recentMaterialsRaw },
    { data: recentAppsRaw },
  ] = await Promise.all([
    supabase.from('participants').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('merged_into', null),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'published'),
    supabase.from('material_pages').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_published', true),
    supabase.from('events').select('id, title, description, cover_image_url, event_date, start_time, event_type, location_info, capacity').eq('org_id', orgId).eq('status', 'published').gte('event_date', now.toISOString().split('T')[0]).order('event_date', { ascending: true }).limit(3),
    supabase.from('participants').select('id, full_name, username, photo_url, created_at, source, tg_user_id, status, participant_status').eq('org_id', orgId).is('merged_into', null).order('created_at', { ascending: false }).limit(20),
    supabase.from('material_pages').select('id, title, updated_at').eq('org_id', orgId).eq('is_published', true).order('updated_at', { ascending: false }).limit(4),
    supabase.from('apps').select('id, name, description, icon').eq('org_id', orgId).eq('status', 'active').limit(4),
  ])

  const normalizePhotoUrl = (url: string | null | undefined): string | null =>
    !url || url === 'none' || url === 'null' ? null : url

  const recentMembers = (recentMembersRaw || []).filter(m =>
    m.source !== 'bot' &&
    !m.source?.includes('bot') &&
    m.source !== 'channel_discussion_import' &&
    !(m.tg_user_id && [777000, 136817688, 1087968824].includes(m.tg_user_id)) &&
    !(m.username?.toLowerCase().includes('bot')) &&
    m.status !== 'archived' &&
    m.participant_status !== 'excluded'
  ).slice(0, 9)

  // Fetch registration counts for upcoming events
  const eventIds = (upcomingEvents || []).map((e: any) => e.id)
  let registrationsMap = new Map<string, any[]>()
  if (eventIds.length > 0) {
    const { data: regs } = await supabase.from('event_registrations').select('event_id, id, participant_id').in('event_id', eventIds).eq('status', 'registered')
    regs?.forEach((r: any) => {
      if (!registrationsMap.has(r.event_id)) registrationsMap.set(r.event_id, [])
      registrationsMap.get(r.event_id)!.push(r)
    })
  }

  return {
    organization: {
      id: org.id,
      name: org.name,
      logo_url: org.logo_url,
      public_description: org.public_description,
      portal_cover_url: (org as any).portal_cover_url ?? null,
      member_count: memberCount || 0,
      event_count: eventCount || 0,
      material_count: materialCount || 0,
    },
    portalSettings: {
      show_events:    org.portal_show_events    ?? true,
      show_members:   org.portal_show_members   ?? true,
      show_materials: org.portal_show_materials ?? false,
      show_apps:      org.portal_show_apps      ?? false,
      welcome_html:   org.portal_welcome_html   ?? null,
    },
    currentParticipant: undefined,
    upcomingEvents: (upcomingEvents || []).map((e: any) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      cover_image_url: e.cover_image_url,
      event_date: e.event_date,
      start_time: e.start_time,
      event_type: e.event_type,
      location_info: e.location_info,
      registered_count: (registrationsMap.get(e.id) || []).length,
      is_user_registered: false,
    })),
    myEventRegistrations: [],
    recentMembers: recentMembers.map((m: any) => ({
      id: m.id,
      full_name: m.full_name || 'Участник',
      username: m.username,
      avatar_url: normalizePhotoUrl(m.photo_url),
      joined_at: m.created_at,
    })),
    recentMaterials: (recentMaterialsRaw || []).map((m: any) => ({ id: m.id, title: m.title, updated_at: m.updated_at })),
    recentApps: (recentAppsRaw || []).map((a: any) => ({ id: a.id, name: a.name, description: a.description ?? null, icon: a.icon ?? null })),
  }
}

/**
 * Get all data needed for the home page
 */
export async function getHomePageData(
  orgId: string,
  userId: string
): Promise<HomePageData | null> {
  const logger = createServiceLogger('getHomePageData');
  const supabase = createAdminServer()

  try {
    // 1. Get organization info
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, logo_url, public_description, portal_cover_url, portal_show_events, portal_show_members, portal_show_materials, portal_show_apps, portal_welcome_html')
      .eq('id', orgId)
      .single()

    if (orgError || !org) {
      logger.error({ 
        error: orgError?.message,
        org_id: orgId,
        user_id: userId
      }, 'Organization not found');
      return null
    }

    // 2. Get current participant info
    // First try: via user_telegram_accounts
    const { data: userTelegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle()

    let participant = null
    
    if (userTelegramAccount?.telegram_user_id) {
      const { data: foundParticipant } = await supabase
        .from('participants')
        .select('*')
        .eq('org_id', orgId)
        .eq('tg_user_id', userTelegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()
      
      participant = foundParticipant
    }
    
    // Second try: via user_id directly (for OAuth users with linked participant)
    if (!participant) {
      const { data: userParticipant } = await supabase
        .from('participants')
        .select('*')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .is('merged_into', null)
        .maybeSingle()
      
      participant = userParticipant
    }

    if (!participant) {
      // Admin/superadmin with no participant record — return org-level data without personal stats
      logger.info({
        org_id: orgId,
        user_id: userId,
        has_telegram_account: !!userTelegramAccount,
      }, 'No participant record for user - returning org-level home data');
      return getOrgOnlyHomePageData(supabase, org, orgId, logger)
    }

    // Calculate participant stats
    const joinedAt = new Date(participant.joined_at || participant.created_at)
    const now = new Date()
    const daysInCommunity = Math.floor((now.getTime() - joinedAt.getTime()) / (1000 * 60 * 60 * 24))
    const isNewcomer = daysInCommunity < 7
    
    // Get last activity
    const { data: lastActivity } = await supabase
      .from('activity_events')
      .select('created_at')
      .eq('org_id', orgId)
      .eq('participant_id', participant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastActiveAt = lastActivity?.created_at || participant.created_at
    const daysSinceActive = Math.floor((now.getTime() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
    const isInactive = daysSinceActive > 14

    // Count events attended
    const { count: eventsAttended } = await supabase
      .from('event_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('participant_id', participant.id)
      .eq('status', 'registered')

    // 3. Get upcoming events (3 max)
    const { data: upcomingEvents } = await supabase
      .from('events')
      .select('id, title, description, cover_image_url, event_date, start_time, event_type, location_info, capacity')
      .eq('org_id', orgId)
      .eq('status', 'published')
      .gte('event_date', now.toISOString().split('T')[0])
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(3)

    // Получаем регистрации для всех событий
    const eventIds = upcomingEvents?.map(e => e.id) || [];
    let registrationsMap = new Map<string, any[]>();
    
    if (eventIds.length > 0) {
      const { data: registrations } = await supabase
        .from('event_registrations')
        .select('event_id, id, status, participant_id')
        .in('event_id', eventIds)
        .eq('status', 'registered');
      
      // Получаем участников для проверки merged_into
      const participantIds = registrations?.map(r => r.participant_id).filter(Boolean) || [];
      const { data: participants } = await supabase
        .from('participants')
        .select('id, merged_into')
        .in('id', participantIds)
        .is('merged_into', null);
      
      const validParticipantIds = new Set(participants?.map(p => p.id) || []);
      
      // Группируем регистрации по event_id
      registrations?.forEach(reg => {
        if (validParticipantIds.has(reg.participant_id)) {
          if (!registrationsMap.has(reg.event_id)) {
            registrationsMap.set(reg.event_id, []);
          }
          registrationsMap.get(reg.event_id)!.push(reg);
        }
      });
    }

    // Process events and calculate registration counts
    const processedEvents = (upcomingEvents || []).map((event: any) => {
      const registrations = registrationsMap.get(event.id) || [];
      
      return {
        id: event.id,
        title: event.title,
        description: event.description,
        cover_image_url: event.cover_image_url,
        event_date: event.event_date,
        start_time: event.start_time,
        event_type: event.event_type,
        location_info: event.location_info,
        registered_count: registrations.length,
        is_user_registered: registrations.some((reg: any) => reg.participant_id === participant.id)
      }
    })

    // 4. Get my event registrations
    const { data: myRegRaw } = await supabase
      .from('event_registrations')
      .select('registered_at, event_id')
      .eq('participant_id', participant.id)
      .eq('status', 'registered')
    
    // Получаем события для регистраций
    let myRegistrations: any[] = [];
    if (myRegRaw && myRegRaw.length > 0) {
      const regEventIds = myRegRaw.map(r => r.event_id);
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, title, event_date, start_time')
        .in('id', regEventIds)
        .gte('event_date', now.toISOString().split('T')[0])
        .order('event_date', { ascending: true });
      
      const eventsMap = new Map(eventsData?.map(e => [e.id, e]) || []);
      myRegistrations = myRegRaw
        .filter(r => eventsMap.has(r.event_id))
        .map(r => ({
          registered_at: r.registered_at,
          events: eventsMap.get(r.event_id)
        }));
    }

    const processedRegistrations = (myRegistrations || []).map((reg: any) => {
      const eventDate = new Date(reg.events.event_date)
      const daysUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      
      return {
        event_id: reg.events.id,
        event_title: reg.events.title,
        event_date: reg.events.event_date,
        start_time: reg.events.start_time,
        registered_at: reg.registered_at,
        days_until_event: daysUntil
      }
    })

    // 5. Get recent members (20 max, will filter in app) - exclude bots, archived, and system accounts
    const { data: recentMembersRaw } = await supabase
      .from('participants')
      .select('id, full_name, username, photo_url, created_at, source, tg_user_id, status, participant_status')
      .eq('org_id', orgId)
      .is('merged_into', null)
      .order('created_at', { ascending: false })
      .limit(20)

    // Normalize photo_url: treat "none"/"null" strings as actual null
    const normalizePhotoUrl = (url: string | null | undefined): string | null => {
      if (!url || url === 'none' || url === 'null') return null
      return url
    }

    // Filter in application code for better control
    const recentMembers = (recentMembersRaw || []).filter(member => {
      // Exclude bots by source
      if (member.source === 'bot') return false
      
      // Exclude bots by source patterns (channel_discussion_import, whatsapp_import, etc.)
      if (member.source && (
        member.source.includes('bot') || 
        member.source === 'channel_discussion_import'
      )) return false
      
      // Exclude system Telegram accounts
      if (member.tg_user_id && [777000, 136817688, 1087968824].includes(member.tg_user_id)) return false
      
      // Exclude by username pattern
      if (member.username && member.username.toLowerCase().includes('bot')) return false
      
      // Exclude archived
      if (member.status === 'archived') return false
      
      // Exclude excluded
      if (member.participant_status === 'excluded') return false
      
      return true
    }).slice(0, 9)

    const processedMembers = recentMembers.map(member => ({
      id: member.id,
      full_name: member.full_name || 'Участник',
      username: member.username,
      avatar_url: normalizePhotoUrl(member.photo_url),
      joined_at: member.created_at
    }))

    // 6. Get counts for organization stats
    const { count: memberCount } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('merged_into', null)

    const { count: eventCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'published')

    const { count: materialCount } = await supabase
      .from('material_pages')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('is_published', true)

    // 7. Get activity summary if inactive
    let activitySummary = undefined
    if (isInactive) {
      const sinceDate = new Date(lastActiveAt)
      
      const { count: newEventsCount } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'published')
        .gte('created_at', sinceDate.toISOString())

      const { count: newMembersCount } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('merged_into', null)
        .gte('created_at', sinceDate.toISOString())

      const { count: newMaterialsCount } = await supabase
        .from('material_pages')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('is_published', true)
        .gte('created_at', sinceDate.toISOString())

      activitySummary = {
        new_events_count: newEventsCount || 0,
        new_members_count: newMembersCount || 0,
        new_materials_count: newMaterialsCount || 0,
        since: lastActiveAt
      }
    }

    // 8. Get recent materials
    const { data: recentMaterialsRaw } = await supabase
      .from('material_pages')
      .select('id, title, updated_at')
      .eq('org_id', orgId)
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .limit(4)

    // 9. Get active apps
    const { data: recentAppsRaw } = await supabase
      .from('apps')
      .select('id, name, description, icon')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .limit(4)

    // Build final data structure
    const homePageData: HomePageData = {
      organization: {
        id: org.id,
        name: org.name,
        logo_url: org.logo_url,
        public_description: org.public_description,
        portal_cover_url: (org as any).portal_cover_url ?? null,
        member_count: memberCount || 0,
        event_count: eventCount || 0,
        material_count: materialCount || 0
      },
      portalSettings: {
        show_events:    org.portal_show_events    ?? true,
        show_members:   org.portal_show_members   ?? true,
        show_materials: org.portal_show_materials ?? false,
        show_apps:      org.portal_show_apps      ?? false,
        welcome_html:   org.portal_welcome_html   ?? null,
      },
      currentParticipant: {
        id: participant.id,
        full_name: participant.full_name || 'Участник',
        username: participant.username,
        avatar_url: normalizePhotoUrl(participant.photo_url),
        joined_at: participant.joined_at || participant.created_at,
        days_in_community: daysInCommunity,
        events_attended: eventsAttended || 0,
        last_active_at: lastActiveAt,
        is_newcomer: isNewcomer,
        is_inactive: isInactive
      },
      upcomingEvents: processedEvents,
      myEventRegistrations: processedRegistrations,
      recentMembers: processedMembers,
      recentMaterials: (recentMaterialsRaw || []).map(m => ({
        id: m.id,
        title: m.title,
        updated_at: m.updated_at
      })),
      recentApps: (recentAppsRaw || []).map(a => ({
        id: a.id,
        name: a.name,
        description: (a as any).description ?? null,
        icon: (a as any).icon ?? null
      })),
      activitySummary
    }

    return homePageData

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId,
      user_id: userId
    }, 'Error in getHomePageData');
    return null
  }
}

