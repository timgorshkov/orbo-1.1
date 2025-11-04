import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

// GET /api/dashboard/[orgId] - Get dashboard data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params
    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user has access to this organization
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 1. Check onboarding status
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('is_verified')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('is_verified', true)
      .single()

    // Get groups count through org_telegram_groups
    const { data: orgGroupsForCount } = await adminSupabase
      .from('org_telegram_groups')
      .select(`
        telegram_groups!inner(bot_status)
      `)
      .eq('org_id', orgId)
    
    const groupsCount = orgGroupsForCount?.filter(
      (item: any) => item.telegram_groups?.bot_status === 'connected'
    ).length || 0

    const { count: materialsCount } = await adminSupabase
      .from('material_pages')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)

    const { count: eventsCount } = await adminSupabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['published', 'completed'])

    const onboardingStatus = {
      hasTelegramAccount: !!telegramAccount,
      hasGroups: (groupsCount || 0) > 0,
      hasMaterials: (materialsCount || 0) > 0,
      hasEvents: (eventsCount || 0) > 0,
      progress: [
        true, // organization created (always true if here)
        !!telegramAccount,
        (groupsCount || 0) > 0,
        (materialsCount || 0) > 0,
        (eventsCount || 0) > 0
      ].filter(Boolean).length * 20 // 0-100%
    }

    const isOnboarding = onboardingStatus.progress < 60 // Less than 60% complete

    // 2. Get total participants count (unique, not sum per group)
    const { count: totalParticipants } = await adminSupabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('source', 'bot') // Exclude bots

    // 3. Get activity for last 14 days (messages per day)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    fourteenDaysAgo.setHours(0, 0, 0, 0)

    // Get all telegram groups for this org through org_telegram_groups
    const { data: orgGroupsData } = await adminSupabase
      .from('org_telegram_groups')
      .select(`
        tg_chat_id,
        telegram_groups!inner(tg_chat_id)
      `)
      .eq('org_id', orgId)

    const chatIds = orgGroupsData?.map(g => String(g.tg_chat_id)) || []
    
    console.log(`Dashboard: Found ${chatIds.length} groups for org ${orgId}`, chatIds)

    // Get activity from group_metrics (aggregated daily metrics per group)
    // Используем ту же логику, что и на странице группы - берём данные из group_metrics
    const last14Days = []
    for (let i = 13; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      last14Days.push(date.toISOString().split('T')[0])
    }
    
    const activityByDay: Record<string, number> = {}
    last14Days.forEach(date => {
      activityByDay[date] = 0
    })
    
    if (chatIds.length > 0) {
      const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0]
      console.log(`Dashboard: Fetching group_metrics since ${fourteenDaysAgoStr} for chats:`, chatIds)
      
      const { data: metricsData, error: metricsError } = await adminSupabase
        .from('group_metrics')
        .select('date, message_count, tg_chat_id, org_id')
        .in('tg_chat_id', chatIds)
        .eq('org_id', orgId)  // Фильтруем по организации чтобы избежать дублей
        .gte('date', fourteenDaysAgoStr)
        .order('date')
      
      console.log(`Dashboard: Found ${metricsData?.length || 0} group_metrics entries, error:`, metricsError)
      if (metricsData && metricsData.length > 0) {
        console.log(`Dashboard: Sample metrics:`, metricsData.slice(0, 3))
      }
      
      // Агрегируем по дням (суммируем по всем группам)
      metricsData?.forEach(metric => {
        const dateKey = metric.date
        if (activityByDay[dateKey] !== undefined) {
          activityByDay[dateKey] += metric.message_count || 0
        }
      })
    } else {
      console.log('Dashboard: No groups found, skipping activity fetch')
    }

    const activityChart = last14Days.map(date => ({
      date,
      messages: activityByDay[date] || 0
    }))
    
    console.log(`Dashboard: Activity chart generated:`, activityChart.slice(0, 5), '...')
    console.log(`Dashboard: Total messages in chart:`, activityChart.reduce((sum, day) => sum + day.messages, 0))

    // 4. Attention zones (only for non-onboarding users)
    let attentionZones = {
      criticalEvents: [],
      churningParticipants: [],
      inactiveNewcomers: []
    }

    if (!isOnboarding && (groupsCount || 0) > 0) {
      // 4a. Events with low registration (< 30% capacity, 3 days before start)
      const threeDaysFromNow = new Date()
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

      const { data: upcomingEvents } = await adminSupabase
        .from('events')
        .select(`
          id,
          title,
          event_date,
          start_time,
          capacity,
          event_registrations!event_registrations_event_id_fkey(id, status)
        `)
        .eq('org_id', orgId)
        .eq('status', 'published')
        .gte('event_date', new Date().toISOString())
        .lte('event_date', threeDaysFromNow.toISOString())

      const criticalEvents = (upcomingEvents || [])
        .map(event => {
          const registeredCount = event.event_registrations?.filter(
            (r: any) => r.status === 'registered'
          ).length || 0
          const registrationRate = event.capacity ? (registeredCount / event.capacity) * 100 : 0

          return {
            id: event.id,
            title: event.title,
            event_date: event.event_date,
            start_time: event.start_time,
            registeredCount,
            capacity: event.capacity,
            registrationRate: Math.round(registrationRate)
          }
        })
        .filter(e => e.registrationRate < 30 && e.capacity)
        .slice(0, 3)

      attentionZones.criticalEvents = criticalEvents as any

      // 4b. Participants on verge of churn (were active, silent 14+ days)
      const fourteenDaysAgo14 = new Date()
      fourteenDaysAgo14.setDate(fourteenDaysAgo14.getDate() - 14)

      const { data: churningParticipants } = await adminSupabase.rpc('get_churning_participants', {
        p_org_id: orgId,
        p_days_silent: 14
      })

      attentionZones.churningParticipants = (churningParticipants || []).slice(0, 5) as any

      // 4c. Inactive newcomers (14+ days after first activity with no second activity)
      const { data: inactiveNewcomers } = await adminSupabase.rpc('get_inactive_newcomers', {
        p_org_id: orgId,
        p_days_since_first: 14
      })

      attentionZones.inactiveNewcomers = (inactiveNewcomers || []).slice(0, 5) as any
    }

    // 5. Upcoming events (next 3)
    const { data: upcomingEvents } = await adminSupabase
      .from('events')
      .select(`
        id,
        title,
        event_date,
        start_time,
        end_time,
        event_type,
        capacity,
        is_paid,
        cover_image_url,
        event_registrations!event_registrations_event_id_fkey(id, status)
      `)
      .eq('org_id', orgId)
      .eq('status', 'published')
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(3)

    const upcomingEventsData = (upcomingEvents || []).map(event => {
      const registeredCount = event.event_registrations?.filter(
        (r: any) => r.status === 'registered'
      ).length || 0
      const registrationRate = event.capacity ? (registeredCount / event.capacity) * 100 : 100

      return {
        id: event.id,
        title: event.title,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        event_type: event.event_type,
        capacity: event.capacity,
        is_paid: event.is_paid,
        cover_image_url: event.cover_image_url,
        registeredCount,
        registrationRate: Math.round(registrationRate)
      }
    })

    return NextResponse.json({
      success: true,
      isOnboarding,
      onboardingStatus,
      metrics: {
        totalParticipants: totalParticipants || 0,
        activityChart
      },
      attentionZones,
      upcomingEvents: upcomingEventsData
    })
  } catch (error: any) {
    console.error('Error in GET /api/dashboard/[orgId]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

