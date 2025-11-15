/**
 * Home Page Data Fetcher
 * Aggregates all data needed for the participant home page
 */

import { createAdminServer } from './supabaseServer'

export interface HomePageData {
  organization: {
    id: string
    name: string
    logo_url: string | null
    description: string | null
    member_count: number
    event_count: number
    material_count: number
  }
  
  currentParticipant: {
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
  
  activitySummary?: {  // только если is_inactive
    new_events_count: number
    new_members_count: number
    new_materials_count: number
    since: string
  }
}

/**
 * Get all data needed for the home page
 */
export async function getHomePageData(
  orgId: string,
  userId: string
): Promise<HomePageData | null> {
  const supabase = createAdminServer()

  try {
    // 1. Get organization info
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, logo_url, description')
      .eq('id', orgId)
      .single()

    if (orgError || !org) {
      console.error('[getHomePageData] Organization not found:', orgError)
      return null
    }

    // 2. Get current participant info
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

    if (!participant) {
      console.error('[getHomePageData] Participant not found for user:', userId)
      return null
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
      .select(`
        id,
        title,
        description,
        cover_image_url,
        event_date,
        start_time,
        event_type,
        location_info,
        capacity,
        event_registrations!event_registrations_event_id_fkey(
          id,
          status,
          participant_id,
          participants!inner(merged_into)
        )
      `)
      .eq('org_id', orgId)
      .eq('status', 'published')
      .gte('event_date', now.toISOString().split('T')[0])
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(3)

    // Process events and calculate registration counts
    const processedEvents = (upcomingEvents || []).map((event: any) => {
      const registrations = (event.event_registrations || []).filter(
        (reg: any) => reg.status === 'registered' && reg.participants?.merged_into === null
      )
      
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
    const { data: myRegistrations } = await supabase
      .from('event_registrations')
      .select(`
        registered_at,
        events!inner(
          id,
          title,
          event_date,
          start_time
        )
      `)
      .eq('participant_id', participant.id)
      .eq('status', 'registered')
      .gte('events.event_date', now.toISOString().split('T')[0])
      .order('events.event_date', { ascending: true })

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

    // 5. Get recent members (5 max)
    const { data: recentMembers } = await supabase
      .from('participants')
      .select('id, full_name, username, photo_url, joined_at, created_at')
      .eq('org_id', orgId)
      .is('merged_into', null)
      .order('joined_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5)

    const processedMembers = (recentMembers || []).map(member => ({
      id: member.id,
      full_name: member.full_name || 'Участник',
      username: member.username,
      avatar_url: member.photo_url,
      joined_at: member.joined_at || member.created_at
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
      .eq('status', 'published')

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
        .gte('joined_at', sinceDate.toISOString())

      const { count: newMaterialsCount } = await supabase
        .from('material_pages')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'published')
        .gte('created_at', sinceDate.toISOString())

      activitySummary = {
        new_events_count: newEventsCount || 0,
        new_members_count: newMembersCount || 0,
        new_materials_count: newMaterialsCount || 0,
        since: lastActiveAt
      }
    }

    // Build final data structure
    const homePageData: HomePageData = {
      organization: {
        id: org.id,
        name: org.name,
        logo_url: org.logo_url,
        description: org.description,
        member_count: memberCount || 0,
        event_count: eventCount || 0,
        material_count: materialCount || 0
      },
      currentParticipant: {
        id: participant.id,
        full_name: participant.full_name || 'Участник',
        username: participant.username,
        avatar_url: participant.photo_url,
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
      activitySummary
    }

    return homePageData

  } catch (error) {
    console.error('[getHomePageData] Error:', error)
    return null
  }
}

