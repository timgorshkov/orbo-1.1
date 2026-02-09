import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

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
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user has access to this organization (with superadmin fallback)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)

    if (!access) {
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
      adminSupabase
        .from('user_telegram_accounts')
        .select('is_verified')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .eq('is_verified', true)
        .single(),
      (async () => {
        const { data: orgGroupLinks } = await adminSupabase
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', orgId);
        
        if (!orgGroupLinks || orgGroupLinks.length === 0) return { data: [] };
        
        const chatIds = orgGroupLinks.map(link => link.tg_chat_id);
        const { data: groups } = await adminSupabase
          .from('telegram_groups')
          .select('bot_status, tg_chat_id')
          .in('tg_chat_id', chatIds);
        
        // Возвращаем в том же формате, что и раньше
        return { data: groups?.map(g => ({ tg_chat_id: g.tg_chat_id, telegram_groups: g })) || [] };
      })(),
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

    // Check if any event has at least one registration (= event was shared)
    let hasSharedEvent = false;
    if ((eventsCount || 0) > 0) {
      // event_registrations doesn't have org_id, so we join through events
      const { data: orgEvents } = await adminSupabase
        .from('events')
        .select('id')
        .eq('org_id', orgId)
        .limit(50);
      
      if (orgEvents && orgEvents.length > 0) {
        const eventIds = orgEvents.map((e: any) => e.id);
        const { count: regCount } = await adminSupabase
          .from('event_registrations')
          .select('*', { count: 'exact', head: true })
          .in('event_id', eventIds)
          .limit(1);
        hasSharedEvent = (regCount || 0) > 0;
      }
    }

    const onboardingStatus = {
      hasTelegramAccount: !!telegramAccount,
      hasGroups: (groupsCount || 0) > 0,
      hasEvents: (eventsCount || 0) > 0,
      hasSharedEvent,
      progress: [
        true, // organization created (always true if here)
        (eventsCount || 0) > 0,
        !!telegramAccount,
        hasSharedEvent,
        (groupsCount || 0) > 0
      ].filter(Boolean).length * 20 // 0-100%
    }

    const isOnboarding = onboardingStatus.progress < 60 // Less than 3 of 5 steps complete

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
      
      // NOTE: НЕ фильтруем по org_id - берём все метрики по chat_id
      // Группа может быть добавлена в несколько организаций, и её история должна быть видна везде
      const { data: metricsData, error: metricsError } = await adminSupabase
        .from('group_metrics')
        .select('date, message_count, tg_chat_id, org_id')
        .in('tg_chat_id', chatIds)
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
      // Дедупликация: для каждой группы берём максимальное значение за день
      // (на случай если метрики записаны для разных org_id)
      const metricsPerGroupPerDay: Record<string, Record<string, number>> = {}
      
      metricsData?.forEach(metric => {
        const chatKey = String(metric.tg_chat_id)
        const dateKey = metric.date
        
        if (!metricsPerGroupPerDay[chatKey]) {
          metricsPerGroupPerDay[chatKey] = {}
        }
        
        // Берём максимальное значение (на случай дублей из разных org)
        const currentVal = metricsPerGroupPerDay[chatKey][dateKey] || 0
        metricsPerGroupPerDay[chatKey][dateKey] = Math.max(currentVal, metric.message_count || 0)
      })
      
      // Теперь суммируем по группам
      Object.values(metricsPerGroupPerDay).forEach(groupMetrics => {
        Object.entries(groupMetrics).forEach(([dateKey, count]) => {
          if (activityByDay[dateKey] !== undefined) {
            activityByDay[dateKey] += count
          }
        })
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
      criticalEvents: [] as any[],
      churningParticipants: [] as any[],
      inactiveNewcomers: [] as any[],
      hasMore: {
        churning: 0,
        newcomers: 0,
        events: 0
      }
    }

    // Day of year for rotation of attention zone items
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    
    if (!isOnboarding && (groupsCount || 0) > 0) {
      // 4a-c. Parallel fetch for attention zones + resolved items
      const threeDaysFromNow = new Date()
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

      const [criticalEventsResult, churningResult, inactiveResult, resolvedItemsResult] = await Promise.all([
        adminSupabase
          .from('events')
          .select('id, title, event_date, start_time, capacity')
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
        }),
        // Fetch resolved attention zone items (last 24 hours)
        adminSupabase
          .from('attention_zone_items')
          .select('item_id, item_type')
          .eq('org_id', orgId)
          .not('resolved_at', 'is', null)
          .gte('resolved_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ])

      // Получаем регистрации для критических событий отдельно
      const criticalEventIds = criticalEventsResult.data?.map(e => e.id) || [];
      let criticalEventsRegistrationsMap = new Map<string, any[]>();
      
      if (criticalEventIds.length > 0) {
        const { data: regs } = await adminSupabase
          .from('event_registrations')
          .select('id, status, event_id')
          .in('event_id', criticalEventIds);
        
        for (const reg of regs || []) {
          const existing = criticalEventsRegistrationsMap.get(reg.event_id) || [];
          existing.push(reg);
          criticalEventsRegistrationsMap.set(reg.event_id, existing);
        }
      }

      // Build set of resolved item IDs by type
      const resolvedIds = new Map<string, Set<string>>()
      for (const item of resolvedItemsResult.data || []) {
        if (!resolvedIds.has(item.item_type)) {
          resolvedIds.set(item.item_type, new Set())
        }
        resolvedIds.get(item.item_type)!.add(item.item_id)
      }

      const criticalEvents = (criticalEventsResult.data || [])
        .map(event => {
          const eventRegs = criticalEventsRegistrationsMap.get(event.id) || [];
          const registeredCount = eventRegs.filter(
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
        // Filter out resolved events
        .filter(e => !resolvedIds.get('critical_event')?.has(e.id))

      // Limit critical events to 3 with rotation
      const eventsOffset = dayOfYear % Math.max(1, criticalEvents.length)
      attentionZones.criticalEvents = (criticalEvents.length <= 3 
        ? criticalEvents 
        : criticalEvents.slice(eventsOffset, eventsOffset + 3).concat(
            criticalEvents.slice(0, Math.max(0, 3 - (criticalEvents.length - eventsOffset)))
          ).slice(0, 3)
      )
      attentionZones.hasMore.events = Math.max(0, criticalEvents.length - 3)

      // Filter churning participants
      const churningParticipants = (churningResult.data || [])
        .filter((p: any) => !resolvedIds.get('churning_participant')?.has(p.participant_id))
      
      // Filter inactive newcomers
      const inactiveNewcomers = (inactiveResult.data || [])
        .filter((p: any) => !resolvedIds.get('inactive_newcomer')?.has(p.participant_id))

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
      
      attentionZones.churningParticipants = getRotatedSlice(churningList, churningOffset, 3)
      attentionZones.inactiveNewcomers = getRotatedSlice(newcomersList, newcomersOffset, 3)
      attentionZones.hasMore.churning = Math.max(0, churningList.length - 3)
      attentionZones.hasMore.newcomers = Math.max(0, newcomersList.length - 3)
    }

    // 4d. Fetch latest AI alerts from notification_logs (last 5 unresolved)
    let aiAlerts: any[] = [];
    try {
      const { data: alertsData } = await adminSupabase
        .from('notification_logs')
        .select('id, rule_id, rule_type, trigger_context, notification_status, created_at, resolved_at')
        .eq('org_id', orgId)
        .in('notification_status', ['sent', 'failed'])
        .in('rule_type', ['negative_discussion', 'unanswered_question', 'group_inactive'])
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      
      aiAlerts = (alertsData || []).map((alert: any) => ({
        id: alert.id,
        type: alert.rule_type,
        message: alert.trigger_context?.summary || alert.trigger_context?.question_text || 
          (alert.rule_type === 'group_inactive' 
            ? `Неактивна ${alert.trigger_context?.inactive_hours || '?'} ч.` 
            : 'Уведомление'),
        severity: alert.trigger_context?.severity || 'medium',
        created_at: alert.created_at,
        group_name: alert.trigger_context?.group_title || alert.trigger_context?.group_name,
      }));
    } catch (alertsError: any) {
      logger.warn({ error: alertsError.message }, 'Error fetching AI alerts for dashboard');
    }

    // 5. Upcoming events (next 3)
    const { data: upcomingEvents } = await adminSupabase
      .from('events')
      .select('id, title, event_date, start_time, end_time, event_type, capacity, is_paid, cover_image_url')
      .eq('org_id', orgId)
      .eq('status', 'published')
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(3)

    // Получаем регистрации для предстоящих событий
    const upcomingEventIds = upcomingEvents?.map(e => e.id) || [];
    let upcomingRegsMap = new Map<string, any[]>();
    
    if (upcomingEventIds.length > 0) {
      const { data: regs } = await adminSupabase
        .from('event_registrations')
        .select('id, status, event_id')
        .in('event_id', upcomingEventIds);
      
      for (const reg of regs || []) {
        const existing = upcomingRegsMap.get(reg.event_id) || [];
        existing.push(reg);
        upcomingRegsMap.set(reg.event_id, existing);
      }
    }

    const upcomingEventsData = (upcomingEvents || []).map(event => {
      const eventRegs = upcomingRegsMap.get(event.id) || [];
      const registeredCount = eventRegs.filter(
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
      aiAlerts,
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

