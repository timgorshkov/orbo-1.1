import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

// GET /api/dashboard/[orgId] - Get dashboard data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/dashboard/[orgId]' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.orgId;
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

    // 1. Check onboarding status - PARALLEL queries
    const [
      telegramAccountResult,
      orgGroupsForCountResult,
      materialsCountResult,
      eventsCountResult,
      totalParticipantsResult
    ] = await Promise.all([
      supabase
        .from('user_telegram_accounts')
        .select('is_verified')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .eq('is_verified', true)
        .single(),
      adminSupabase
        .from('org_telegram_groups')
        .select(`
          tg_chat_id,
          telegram_groups!inner(bot_status, tg_chat_id)
        `)
        .eq('org_id', orgId),
      adminSupabase
        .from('material_pages')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId),
      adminSupabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('status', ['published', 'completed']),
      adminSupabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('source', 'bot')
    ])

    const telegramAccount = telegramAccountResult.data
    const orgGroupsForCount = orgGroupsForCountResult.data
    const materialsCount = materialsCountResult.count
    const eventsCount = eventsCountResult.count
    const totalParticipants = totalParticipantsResult.count
    
    const groupsCount = orgGroupsForCount?.filter(
      (item: any) => item.telegram_groups?.bot_status === 'connected'
    ).length || 0

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

    // 2. Get activity for last 14 days (messages per day)
    // Note: totalParticipants already fetched in parallel above
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    fourteenDaysAgo.setHours(0, 0, 0, 0)

    // Reuse orgGroupsForCount data instead of separate query
    const chatIds = orgGroupsForCount?.map(g => String(g.tg_chat_id)) || []
    
    logger.debug({ 
      group_count: chatIds.length,
      org_id: orgId,
      chat_ids: chatIds
    }, 'Found groups for org');

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
      logger.debug({ 
        since: fourteenDaysAgoStr,
        chat_ids: chatIds,
        org_id: orgId
      }, 'Fetching group_metrics');
      
      const { data: metricsData, error: metricsError } = await adminSupabase
        .from('group_metrics')
        .select('date, message_count, tg_chat_id, org_id')
        .in('tg_chat_id', chatIds)
        .eq('org_id', orgId)  // Фильтруем по организации чтобы избежать дублей
        .gte('date', fourteenDaysAgoStr)
        .order('date')
      
      if (metricsError) {
        logger.warn({ 
          error: metricsError.message,
          org_id: orgId
        }, 'Error fetching group_metrics');
      } else {
        logger.debug({ 
          metrics_count: metricsData?.length || 0,
          org_id: orgId
        }, 'Found group_metrics entries');
      }
      
      // Агрегируем по дням (суммируем по всем группам)
      metricsData?.forEach(metric => {
        const dateKey = metric.date
        if (activityByDay[dateKey] !== undefined) {
          activityByDay[dateKey] += metric.message_count || 0
        }
      })
    } else {
      logger.debug({ org_id: orgId }, 'No groups found, skipping activity fetch');
    }
    
    // Also add WhatsApp activity (tg_chat_id = 0)
    const { data: whatsappActivity } = await adminSupabase
      .from('activity_events')
      .select('created_at')
      .eq('org_id', orgId)
      .eq('tg_chat_id', 0)
      .eq('event_type', 'message')
      .gte('created_at', fourteenDaysAgo.toISOString())
    
    if (whatsappActivity) {
      whatsappActivity.forEach(event => {
        const dateKey = new Date(event.created_at).toISOString().split('T')[0]
        if (activityByDay[dateKey] !== undefined) {
          activityByDay[dateKey] += 1
        }
      })
      logger.debug({ 
        whatsapp_messages: whatsappActivity.length,
        org_id: orgId
      }, 'Added WhatsApp messages to activity chart');
    }

    const activityChart = last14Days.map(date => ({
      date,
      messages: activityByDay[date] || 0
    }))
    
    const totalMessages = activityChart.reduce((sum, day) => sum + day.messages, 0);
    logger.debug({ 
      total_messages: totalMessages,
      org_id: orgId
    }, 'Activity chart generated');

    // 4. Attention zones (only for non-onboarding users)
    let attentionZones = {
      criticalEvents: [],
      churningParticipants: [],
      inactiveNewcomers: []
    }

    // Day of year for rotation of attention zone items
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    
    if (!isOnboarding && (groupsCount || 0) > 0) {
      // 4a-c. Parallel fetch for attention zones
      const threeDaysFromNow = new Date()
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

      const [criticalEventsResult, churningResult, inactiveResult] = await Promise.all([
        adminSupabase
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
          .lte('event_date', threeDaysFromNow.toISOString()),
        adminSupabase.rpc('get_churning_participants', {
          p_org_id: orgId,
          p_days_silent: 14
        }),
        adminSupabase.rpc('get_inactive_newcomers', {
          p_org_id: orgId,
          p_days_since_first: 14
        })
      ])

      const criticalEvents = (criticalEventsResult.data || [])
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

      // Limit critical events to 3 with rotation
      const eventsOffset = dayOfYear % Math.max(1, criticalEvents.length)
      attentionZones.criticalEvents = (criticalEvents.length <= 3 
        ? criticalEvents 
        : criticalEvents.slice(eventsOffset, eventsOffset + 3).concat(
            criticalEvents.slice(0, Math.max(0, 3 - (criticalEvents.length - eventsOffset)))
          ).slice(0, 3)
      ) as any

      const churningParticipants = churningResult.data
      const inactiveNewcomers = inactiveResult.data

      // Limit to 3 items with daily rotation for variety
      const churningList = churningParticipants || []
      const newcomersList = inactiveNewcomers || []
      
      // Rotate based on day - shows different participants each day
      const churningOffset = dayOfYear % Math.max(1, churningList.length)
      const newcomersOffset = dayOfYear % Math.max(1, newcomersList.length)
      
      // Get 3 items with rotation (wrap around)
      const getRotatedSlice = (arr: any[], offset: number, limit: number) => {
        if (arr.length <= limit) return arr
        const result = []
        for (let i = 0; i < limit; i++) {
          result.push(arr[(offset + i) % arr.length])
        }
        return result
      }
      
      attentionZones.churningParticipants = getRotatedSlice(churningList, churningOffset, 3) as any
      attentionZones.inactiveNewcomers = getRotatedSlice(newcomersList, newcomersOffset, 3) as any
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
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in GET /api/dashboard/[orgId]');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

