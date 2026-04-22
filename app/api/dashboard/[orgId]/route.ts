import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { telegramFetch } from '@/lib/services/telegramService'

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
      totalParticipantsResult,
      orgNameResult
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
        .neq('source', 'bot'),
      adminSupabase
        .from('organizations')
        .select('name, timezone')
        .eq('id', orgId)
        .single()
    ])

    const telegramAccount = (telegramAccountResult.data && telegramAccountResult.data.length > 0)
      || (telegramProviderResult.data && telegramProviderResult.data.length > 0)
    const orgGroupsForCount = orgGroupsForCountResult.data
    const materialsCount = materialsCountResult.count
    const eventsCount = eventsCountResult.count
    const totalParticipants = totalParticipantsResult.count
    const orgName = orgNameResult.data?.name || ''
    const orgTimezone = (orgNameResult.data?.timezone as string) || 'Europe/Moscow'
    const hasCustomOrgName = !!orgName && orgName !== 'Моё сообщество'
    
    const connectedGroupsCount = orgGroupsForCount?.filter(
      (item: any) => item.telegram_groups?.bot_status === 'connected'
    ).length || 0
    // For onboarding: any linked group counts (even pending)
    const linkedGroupsCount = orgGroupsForCount?.length || 0

    // All remaining queries run in ONE parallel block.
    // Dependencies from Block 1: telegramAccount, eventsCount, orgId, chatIds, connectedGroupsCount
    const chatIds = orgGroupsForCount?.map(g => String(g.tg_chat_id)) || []

    // assistBotStarted check — runs in background with 1.5s timeout
    const assistBotPromise: Promise<boolean> = (async () => {
      if (!telegramAccount) return false;
      try {
        let tgUserId: number | null = null;
        if (telegramAccountResult.data && telegramAccountResult.data.length > 0) {
          const { data: tgLink } = await adminSupabase
            .from('user_telegram_accounts')
            .select('telegram_user_id')
            .eq('org_id', orgId)
            .eq('is_verified', true)
            .limit(1)
            .single();
          tgUserId = tgLink?.telegram_user_id || null;
        }
        if (!tgUserId && telegramProviderResult.data && telegramProviderResult.data.length > 0) {
          const ownerUserId = telegramProviderResult.data[0].user_id;
          const { data: acc } = await adminSupabase
            .from('accounts')
            .select('provider_account_id')
            .eq('user_id', ownerUserId)
            .eq('provider', 'telegram')
            .maybeSingle();
          tgUserId = acc?.provider_account_id ? Number(acc.provider_account_id) : null;
        }
        if (!tgUserId) return false;
        const notifBotToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
        if (!notifBotToken) return false;
        const res = await telegramFetch(`https://api.telegram.org/bot${notifBotToken}/getChat?chat_id=${tgUserId}`, {
          signal: AbortSignal.timeout(1500)
        });
        const chatData = await res.json();
        return chatData.ok === true;
      } catch { return false; }
    })();

    // Pre-compute values needed by multiple parallel tasks
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    fourteenDaysAgo.setHours(0, 0, 0, 0)
    const startIso = fourteenDaysAgo.toISOString()
    const last14Days: string[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      last14Days.push(d.toLocaleDateString('en-CA', { timeZone: orgTimezone }))
    }
    const numericChatIds = chatIds.map(Number).filter(Number.isFinite);
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

    // SINGLE PARALLEL BLOCK: hasSharedEvent, MAX groups, AI alerts, upcoming events, activity chart, attention zones
    const [
      hasSharedEventResult,
      orgMaxLinksResult,
      aiAlertsResult,
      upcomingEventsResult,
      activityResult,
      attentionZonesResult,
    ] = await Promise.all([
      // hasSharedEvent — single query instead of 2
      (async () => {
        if ((eventsCount || 0) === 0) return false;
        const { count } = await adminSupabase
          .from('event_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .limit(1);
        return (count || 0) > 0;
      })(),
      // MAX groups
      adminSupabase
        .from('org_max_groups')
        .select('max_chat_id')
        .eq('org_id', orgId),
      // AI alerts
      (async () => {
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
          return (alertsData || []).map((alert: any) => ({
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
        } catch { return []; }
      })(),
      // upcoming events + registrations
      (async () => {
        const { data: upcomingEvents } = await adminSupabase
          .from('events')
          .select('id, title, event_date, start_time, end_time, event_type, capacity, is_paid, cover_image_url')
          .eq('org_id', orgId)
          .eq('status', 'published')
          .gte('event_date', new Date().toISOString())
          .order('event_date', { ascending: true })
          .limit(3);
        const upcomingEventIds = upcomingEvents?.map(e => e.id) || [];
        const upcomingRegsMap = new Map<string, any[]>();
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
        return (upcomingEvents || []).map(event => {
          const eventRegs = upcomingRegsMap.get(event.id) || [];
          const registeredCount = eventRegs.filter((r: any) => r.status === 'registered').length || 0;
          const registrationRate = event.capacity ? (registeredCount / event.capacity) * 100 : 100;
          return {
            id: event.id, title: event.title, event_date: event.event_date,
            start_time: event.start_time, end_time: event.end_time, event_type: event.event_type,
            capacity: event.capacity, is_paid: event.is_paid, cover_image_url: event.cover_image_url,
            registeredCount, registrationRate: Math.round(registrationRate)
          };
        });
      })(),
      // Activity chart — SQL-side aggregation
      (async () => {
        const activityByDay: Record<string, number> = {}
        last14Days.forEach(date => { activityByDay[date] = 0 })
        const queries: Promise<void>[] = [];

        if (numericChatIds.length > 0) {
          queries.push((async () => {
            const { data: rows } = await adminSupabase.raw<{ date: string; cnt: string }>(
              `SELECT (created_at AT TIME ZONE $1)::date::text AS date, COUNT(*) AS cnt
               FROM activity_events
               WHERE org_id = $2 AND event_type = 'message' AND created_at >= $3
                 AND tg_chat_id = ANY($4)
               GROUP BY 1`,
              [orgTimezone, orgId, startIso, numericChatIds]
            );
            rows?.forEach(r => { if (activityByDay[r.date] !== undefined) activityByDay[r.date] += Number(r.cnt) || 0 });
          })());
        }
        queries.push((async () => {
          const { data: rows } = await adminSupabase.raw<{ date: string; cnt: string }>(
            `SELECT (created_at AT TIME ZONE $1)::date::text AS date, COUNT(*) AS cnt
             FROM activity_events
             WHERE org_id = $2 AND tg_chat_id = 0 AND event_type = 'message' AND created_at >= $3
             GROUP BY 1`,
            [orgTimezone, orgId, startIso]
          );
          rows?.forEach(r => { if (activityByDay[r.date] !== undefined) activityByDay[r.date] += Number(r.cnt) || 0 });
        })());
        // MAX activity query will be added after maxChatIds are available — runs in main block instead

        await Promise.all(queries);
        return activityByDay;
      })(),
      // Attention zones (with 4s timeout, includes event_registrations inside)
      (async () => {
        if (connectedGroupsCount === 0) return null;
        try {
          const result = await Promise.race([
            Promise.all([
              adminSupabase
                .from('events')
                .select('id, title, event_date, start_time, capacity')
                .eq('org_id', orgId)
                .eq('status', 'published')
                .gte('event_date', new Date().toISOString())
                .lte('event_date', threeDaysFromNow.toISOString()),
              adminSupabase.rpc('get_churning_participants', { p_org_id: orgId, p_days_silent: 14 }),
              adminSupabase.rpc('get_inactive_newcomers', { p_org_id: orgId, p_days_since_first: 14 }),
              adminSupabase
                .from('attention_zone_items')
                .select('item_id, item_type')
                .eq('org_id', orgId)
                .not('resolved_at', 'is', null)
                .gte('resolved_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            ]),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
          ]);
          if (!result) {
            logger.warn({ org_id: orgId }, 'Attention zones timeout (4s)');
            return null;
          }
          const [critEvents, churning, inactive, resolved] = result;

          // Fetch registrations for critical events (inside the same async block, not sequential)
          const criticalEventIds = critEvents.data?.map(e => e.id) || [];
          const regsMap = new Map<string, any[]>();
          if (criticalEventIds.length > 0) {
            const { data: regs } = await adminSupabase
              .from('event_registrations')
              .select('id, status, event_id')
              .in('event_id', criticalEventIds);
            for (const reg of regs || []) {
              const existing = regsMap.get(reg.event_id) || [];
              existing.push(reg);
              regsMap.set(reg.event_id, existing);
            }
          }
          return { critEvents, churning, inactive, resolved, regsMap };
        } catch (err) {
          logger.warn({ org_id: orgId, error: String(err) }, 'Attention zones error');
          return null;
        }
      })()
    ]);

    const hasSharedEvent = hasSharedEventResult;
    const maxChatIds = (orgMaxLinksResult.data ?? []).map((r: any) => String(r.max_chat_id));
    const aiAlerts: any[] = aiAlertsResult;
    const upcomingEventsData = upcomingEventsResult;

    // Add MAX activity data (needs maxChatIds which were fetched in parallel)
    const activityByDay = activityResult;
    const numericMaxChatIds = maxChatIds.map(Number).filter(Number.isFinite);
    if (numericMaxChatIds.length > 0) {
      const { data: rows } = await adminSupabase.raw<{ date: string; cnt: string }>(
        `SELECT (created_at AT TIME ZONE $1)::date::text AS date, COUNT(*) AS cnt
         FROM activity_events
         WHERE org_id = $2 AND event_type = 'message' AND messenger_type = 'max'
           AND created_at >= $3 AND max_chat_id = ANY($4)
         GROUP BY 1`,
        [orgTimezone, orgId, startIso, numericMaxChatIds]
      );
      rows?.forEach(r => { if (activityByDay[r.date] !== undefined) activityByDay[r.date] += Number(r.cnt) || 0 });
    }

    const activityChart = last14Days.map(date => ({
      date,
      messages: activityByDay[date] || 0
    }))

    // Build onboarding status
    const onboardingStatus = {
      hasTelegramAccount: !!telegramAccount,
      hasCustomOrgName,
      hasGroups: linkedGroupsCount > 0,
      hasEvents: (eventsCount || 0) > 0,
      hasSharedEvent,
      assistBotStarted: false,
      progress: 0
    }

    // Process attention zones
    let attentionZones = {
      criticalEvents: [] as any[],
      churningParticipants: [] as any[],
      inactiveNewcomers: [] as any[],
      hasMore: { churning: 0, newcomers: 0, events: 0 }
    }

    const isOnboarding = [
      true, hasCustomOrgName, (eventsCount || 0) > 0, !!telegramAccount,
      false, hasSharedEvent, linkedGroupsCount > 0
    ].filter(Boolean).length * (100 / 7) < 60

    if (!isOnboarding && attentionZonesResult) {
      const { critEvents, churning, inactive, resolved, regsMap } = attentionZonesResult

      const resolvedIds = new Map<string, Set<string>>()
      for (const item of resolved.data || []) {
        if (!resolvedIds.has(item.item_type)) resolvedIds.set(item.item_type, new Set())
        resolvedIds.get(item.item_type)!.add(item.item_id)
      }

      const criticalEvents = (critEvents.data || [])
        .map(event => {
          const eventRegs = regsMap.get(event.id) || [];
          const registeredCount = eventRegs.filter((r: any) => r.status === 'registered').length || 0
          const registrationRate = event.capacity ? (registeredCount / event.capacity) * 100 : 0
          return {
            id: event.id, title: event.title, event_date: event.event_date,
            start_time: event.start_time, registeredCount,
            capacity: event.capacity, registrationRate: Math.round(registrationRate)
          }
        })
        .filter(e => e.registrationRate < 30 && e.capacity)
        .filter(e => !resolvedIds.get('critical_event')?.has(e.id))

      const eventsOffset = dayOfYear % Math.max(1, criticalEvents.length)
      attentionZones.criticalEvents = criticalEvents.length <= 3
        ? criticalEvents
        : criticalEvents.slice(eventsOffset, eventsOffset + 3).concat(
            criticalEvents.slice(0, Math.max(0, 3 - (criticalEvents.length - eventsOffset)))
          ).slice(0, 3)
      attentionZones.hasMore.events = Math.max(0, criticalEvents.length - 3)

      const churningParticipants = (churning.data || [])
        .filter((p: any) => !resolvedIds.get('churning_participant')?.has(p.participant_id))
      const inactiveNewcomers = (inactive.data || [])
        .filter((p: any) => !resolvedIds.get('inactive_newcomer')?.has(p.participant_id))

      const getRotatedSlice = (arr: any[], offset: number, limit: number) => {
        if (arr.length <= limit) return arr
        const result = []
        for (let i = 0; i < limit; i++) result.push(arr[(offset + i) % arr.length])
        return result
      }

      attentionZones.churningParticipants = getRotatedSlice(churningParticipants, dayOfYear % Math.max(1, churningParticipants.length), 3)
      attentionZones.inactiveNewcomers = getRotatedSlice(inactiveNewcomers, dayOfYear % Math.max(1, inactiveNewcomers.length), 3)
      attentionZones.hasMore.churning = Math.max(0, churningParticipants.length - 3)
      attentionZones.hasMore.newcomers = Math.max(0, inactiveNewcomers.length - 3)
    }

    // Collect assistBotStarted — has been running in parallel with all DB work above
    const assistBotStartedFinal = await assistBotPromise;
    onboardingStatus.assistBotStarted = assistBotStartedFinal;
    onboardingStatus.progress = [
      true,
      hasCustomOrgName,
      (eventsCount || 0) > 0,
      !!telegramAccount,
      assistBotStartedFinal,
      hasSharedEvent,
      linkedGroupsCount > 0
    ].filter(Boolean).length * (100 / 7)

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

