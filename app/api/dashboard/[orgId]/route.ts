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
      telegramProviderResult,
      orgGroupsForCountResult,
      materialsCountResult,
      eventsCountResult,
      totalParticipantsResult
    ] = await Promise.all([
      // Check if ANY owner/admin of this org has a verified telegram account
      adminSupabase
        .from('user_telegram_accounts')
        .select('is_verified')
        .eq('org_id', orgId)
        .eq('is_verified', true)
        .limit(1),
      // Fallback: check if org owner/admin has TG connected via OAuth (accounts table)
      // or via the welcome-screen linking flow (users.tg_user_id set directly).
      (async () => {
        const { data: owners } = await adminSupabase
          .from('memberships')
          .select('user_id')
          .eq('org_id', orgId)
          .in('role', ['owner', 'admin'])
        if (!owners || owners.length === 0) return { data: [] }
        const ownerIds = owners.map(o => o.user_id)

        // Check OAuth-linked Telegram accounts
        const { data: oauthTg } = await adminSupabase
          .from('accounts')
          .select('user_id')
          .eq('provider', 'telegram')
          .in('user_id', ownerIds)
          .limit(1)
        if (oauthTg && oauthTg.length > 0) return { data: oauthTg }

        // Check welcome-screen TG linking (users.tg_user_id set, no OAuth record)
        const { data: usersWithTg } = await adminSupabase
          .from('users')
          .select('id')
          .in('id', ownerIds)
          .not('tg_user_id', 'is', null)
          .limit(1)
        return { data: usersWithTg || [] }
      })(),
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

    const telegramAccount = (telegramAccountResult.data && telegramAccountResult.data.length > 0)
      || (telegramProviderResult.data && telegramProviderResult.data.length > 0)
    const orgGroupsForCount = orgGroupsForCountResult.data
    const materialsCount = materialsCountResult.count
    const eventsCount = eventsCountResult.count
    const totalParticipants = totalParticipantsResult.count
    
    const connectedGroupsCount = orgGroupsForCount?.filter(
      (item: any) => item.telegram_groups?.bot_status === 'connected'
    ).length || 0
    // For onboarding: any linked group counts (even pending)
    const linkedGroupsCount = orgGroupsForCount?.length || 0

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

    // Check if assist bot (orbo_assistant_bot) has been started by an owner/admin
    let assistBotStarted = false
    if (telegramAccount) {
      try {
        // Get the telegram_user_id of any org owner/admin
        let tgUserId: number | null = null
        
        if (telegramAccountResult.data && telegramAccountResult.data.length > 0) {
          // Get from user_telegram_accounts
          const { data: tgLink } = await adminSupabase
            .from('user_telegram_accounts')
            .select('telegram_user_id')
            .eq('org_id', orgId)
            .eq('is_verified', true)
            .limit(1)
            .single()
          tgUserId = tgLink?.telegram_user_id || null
        }
        
        if (!tgUserId && telegramProviderResult.data && telegramProviderResult.data.length > 0) {
          const ownerUserId = telegramProviderResult.data[0].user_id
          const { data: acc } = await adminSupabase
            .from('accounts')
            .select('provider_account_id')
            .eq('user_id', ownerUserId)
            .eq('provider', 'telegram')
            .maybeSingle()
          tgUserId = acc?.provider_account_id ? Number(acc.provider_account_id) : null
        }
        
        if (tgUserId) {
          const notifBotToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
          if (notifBotToken) {
            const res = await fetch(`https://api.telegram.org/bot${notifBotToken}/getChat?chat_id=${tgUserId}`)
            const chatData = await res.json()
            assistBotStarted = chatData.ok === true
          }
        }
      } catch { /* non-critical */ }
    }

    const onboardingStatus = {
      hasTelegramAccount: !!telegramAccount,
      hasGroups: linkedGroupsCount > 0,
      hasEvents: (eventsCount || 0) > 0,
      hasSharedEvent,
      assistBotStarted,
      progress: [
        true, // organization created (always true if here)
        (eventsCount || 0) > 0,
        !!telegramAccount,
        assistBotStarted,
        hasSharedEvent,
        linkedGroupsCount > 0
      ].filter(Boolean).length * (100 / 6) // 0-100% across 6 steps
    }

    const isOnboarding = onboardingStatus.progress < 60 // Less than 3 of 5 steps complete

    // 2. Get activity for last 14 days (messages per day) in org timezone
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    fourteenDaysAgo.setHours(0, 0, 0, 0)

    const chatIds = orgGroupsForCount?.map(g => String(g.tg_chat_id)) || []

    // Org timezone for chart (default Moscow GMT+3)
    const { data: orgRow } = await adminSupabase
      .from('organizations')
      .select('timezone')
      .eq('id', orgId)
      .maybeSingle()
    const orgTimezone = (orgRow?.timezone as string) || 'Europe/Moscow'

    // Linked MAX groups for this org (to include MAX activity in chart)
    const { data: orgMaxLinks } = await adminSupabase
      .from('org_max_groups')
      .select('max_chat_id')
      .eq('org_id', orgId)
    const maxChatIds = (orgMaxLinks ?? []).map((r: { max_chat_id: string }) => String(r.max_chat_id))

    logger.debug({
      group_count: chatIds.length,
      max_group_count: maxChatIds.length,
      org_id: orgId,
      org_timezone: orgTimezone
    }, 'Found groups for org')

    // Build 14 days in org timezone (YYYY-MM-DD)
    const last14Days: string[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      last14Days.push(d.toLocaleDateString('en-CA', { timeZone: orgTimezone }))
    }
    const activityByDay: Record<string, number> = {}
    last14Days.forEach(date => { activityByDay[date] = 0 })

    // Activity from activity_events: Telegram groups + WhatsApp + MAX groups, bucketed by org timezone
    const activityPromises: Promise<{ data: { created_at: string }[] | null }>[] = []
    if (chatIds.length > 0) {
      activityPromises.push(
        adminSupabase
          .from('activity_events')
          .select('created_at')
          .eq('org_id', orgId)
          .eq('event_type', 'message')
          .gte('created_at', fourteenDaysAgo.toISOString())
          .in('tg_chat_id', chatIds)
          .then(r => ({ data: r.data }))
      )
    }
    activityPromises.push(
      adminSupabase
        .from('activity_events')
        .select('created_at')
        .eq('org_id', orgId)
        .eq('tg_chat_id', 0)
        .eq('event_type', 'message')
        .gte('created_at', fourteenDaysAgo.toISOString())
        .then(r => ({ data: r.data }))
    )
    if (maxChatIds.length > 0) {
      activityPromises.push(
        adminSupabase
          .from('activity_events')
          .select('created_at')
          .eq('org_id', orgId)
          .eq('event_type', 'message')
          .eq('messenger_type', 'max')
          .gte('created_at', fourteenDaysAgo.toISOString())
          .in('max_chat_id', maxChatIds)
          .then(r => ({ data: r.data }))
      )
    }
    const activityResults = await Promise.all(activityPromises)
    const toOrgDateKey = (iso: string) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: orgTimezone })
    activityResults.forEach(result => {
      result.data?.forEach((event: { created_at: string }) => {
        const dateKey = toOrgDateKey(event.created_at)
        if (activityByDay[dateKey] !== undefined) activityByDay[dateKey] += 1
      })
    })
    logger.debug({
      total_events: activityResults.reduce((s, r) => s + (r.data?.length ?? 0), 0),
      org_id: orgId
    }, 'Activity chart from Telegram + WhatsApp + MAX (org TZ)')

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
    
    if (!isOnboarding && connectedGroupsCount > 0) {
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

