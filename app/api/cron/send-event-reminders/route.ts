import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { createCronLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cron job to send personal DM reminders to event participants via @orbo_community_bot
// Handles: 24h reminders, 1h reminders, and post-event follow-ups
// Runs every hour
export async function GET(request: NextRequest) {
  const logger = createCronLogger('send-event-reminders');
  
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info({}, '🔔 Starting personal event reminders cron');

    const adminSupabase = createAdminServer();
    const telegramService = new TelegramService('main'); // @orbo_community_bot

    const now = new Date();
    let totalSent = 0;
    const errors: string[] = [];

    // ===== 1. SEND 24-HOUR REMINDERS =====
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    dayAfterTomorrow.setHours(0, 0, 0, 0);

    const sent24h = await sendRemindersForWindow({
      adminSupabase,
      telegramService,
      logger,
      startDate: tomorrow.toISOString().split('T')[0],
      endDate: dayAfterTomorrow.toISOString().split('T')[0],
      reminderType: '24h',
      errors
    });
    totalSent += sent24h;

    // ===== 2. SEND 1-HOUR REMINDERS =====
    // Events starting in the next 1-2 hours
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    // For 1h reminders, we need to check events happening today
    const today = now.toISOString().split('T')[0];
    const currentTime = `${String(oneHourFromNow.getHours()).padStart(2, '0')}:${String(oneHourFromNow.getMinutes()).padStart(2, '0')}`;
    const twoHourTime = `${String(twoHoursFromNow.getHours()).padStart(2, '0')}:${String(twoHoursFromNow.getMinutes()).padStart(2, '0')}`;

    const sent1h = await sendOneHourReminders({
      adminSupabase,
      telegramService,
      logger,
      today,
      startTime: currentTime,
      endTime: twoHourTime,
      errors
    });
    totalSent += sent1h;

    // ===== 3. POST-EVENT FOLLOW-UPS =====
    // Events that ended yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const sentFollowUp = await sendPostEventFollowUps({
      adminSupabase,
      telegramService,
      logger,
      eventDate: yesterday.toISOString().split('T')[0],
      errors
    });
    totalSent += sentFollowUp;

    logger.info({ 
      sent: totalSent,
      sent_24h: sent24h,
      sent_1h: sent1h,
      sent_followup: sentFollowUp,
      errors_count: errors.length
    }, '✅ Completed personal event reminders');

    return NextResponse.json({
      success: true,
      message: `Sent ${totalSent} personal reminders`,
      sent: totalSent,
      breakdown: { sent_24h, sent_1h, sent_followup: sentFollowUp },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });

  } catch (error: any) {
    const logger = createCronLogger('send-event-reminders');
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, '❌ Fatal error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===== HELPER: Send 24h reminders =====
async function sendRemindersForWindow({
  adminSupabase, telegramService, logger, startDate, endDate, reminderType, errors
}: {
  adminSupabase: any;
  telegramService: TelegramService;
  logger: any;
  startDate: string;
  endDate: string;
  reminderType: string;
  errors: string[];
}): Promise<number> {
  // Fetch published events in the window
  const { data: eventsRaw, error: eventsError } = await adminSupabase
    .from('events')
    .select('id, title, event_date, start_time, org_id, location_info, requires_payment')
    .eq('status', 'published')
    .gte('event_date', startDate)
    .lt('event_date', endDate);

  if (eventsError || !eventsRaw || eventsRaw.length === 0) {
    if (eventsError) logger.error({ error: eventsError.message }, 'Error fetching events');
    return 0;
  }

  // Get org names
  const orgIds = Array.from(new Set(eventsRaw.map((e: any) => e.org_id)));
  const { data: orgs } = await adminSupabase
    .from('organizations')
    .select('id, name')
    .in('id', orgIds);
  const orgsMap = new Map(orgs?.map((o: any) => [o.id, o]) || []);

  let totalSent = 0;

  for (const event of eventsRaw) {
    const org = orgsMap.get(event.org_id);
    const sent = await sendReminderToParticipants({
      adminSupabase, telegramService, logger, event, orgName: org?.name || '', reminderType, errors
    });
    totalSent += sent;
  }

  return totalSent;
}

// ===== HELPER: Send 1-hour reminders =====
async function sendOneHourReminders({
  adminSupabase, telegramService, logger, today, startTime, endTime, errors
}: {
  adminSupabase: any;
  telegramService: TelegramService;
  logger: any;
  today: string;
  startTime: string;
  endTime: string;
  errors: string[];
}): Promise<number> {
  // Fetch events today with start_time in the 1-2 hour window
  const { data: eventsRaw, error: eventsError } = await adminSupabase
    .from('events')
    .select('id, title, event_date, start_time, org_id, location_info, requires_payment')
    .eq('status', 'published')
    .eq('event_date', today)
    .gte('start_time', startTime)
    .lt('start_time', endTime);

  if (eventsError || !eventsRaw || eventsRaw.length === 0) {
    return 0;
  }

  const orgIds = Array.from(new Set(eventsRaw.map((e: any) => e.org_id)));
  const { data: orgs } = await adminSupabase
    .from('organizations')
    .select('id, name')
    .in('id', orgIds);
  const orgsMap = new Map(orgs?.map((o: any) => [o.id, o]) || []);

  let totalSent = 0;

  for (const event of eventsRaw) {
    const org = orgsMap.get(event.org_id);
    const sent = await sendReminderToParticipants({
      adminSupabase, telegramService, logger, event, orgName: org?.name || '', reminderType: '1h', errors
    });
    totalSent += sent;
  }

  return totalSent;
}

// ===== HELPER: Send post-event follow-ups =====
async function sendPostEventFollowUps({
  adminSupabase, telegramService, logger, eventDate, errors
}: {
  adminSupabase: any;
  telegramService: TelegramService;
  logger: any;
  eventDate: string;
  errors: string[];
}): Promise<number> {
  // Fetch events that happened yesterday
  const { data: eventsRaw, error: eventsError } = await adminSupabase
    .from('events')
    .select('id, title, event_date, org_id')
    .eq('status', 'published')
    .eq('event_date', eventDate);

  if (eventsError || !eventsRaw || eventsRaw.length === 0) {
    return 0;
  }

  const orgIds = Array.from(new Set(eventsRaw.map((e: any) => e.org_id)));
  const { data: orgs } = await adminSupabase
    .from('organizations')
    .select('id, name')
    .in('id', orgIds);
  const orgsMap = new Map(orgs?.map((o: any) => [o.id, o]) || []);

  let totalSent = 0;

  for (const event of eventsRaw) {
    try {
      // Get registrations that attended (check-in)
      const { data: attendedRegs } = await adminSupabase
        .from('event_registrations')
        .select('participant_id')
        .eq('event_id', event.id)
        .eq('status', 'attended');

      // Get registrations that were registered but didn't attend (no-show)
      const { data: noShowRegs } = await adminSupabase
        .from('event_registrations')
        .select('participant_id')
        .eq('event_id', event.id)
        .eq('status', 'registered'); // Still "registered" = didn't check in

      const org = orgsMap.get(event.org_id);
      const orgName = org?.name || '';
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';

      // Send thank-you to attended
      if (attendedRegs && attendedRegs.length > 0) {
        const participantIds = attendedRegs.map((r: any) => r.participant_id);
        const { data: participants } = await adminSupabase
          .from('participants')
          .select('id, tg_user_id, full_name, merged_into')
          .in('id', participantIds)
          .is('merged_into', null);

        for (const p of (participants || [])) {
          if (!p.tg_user_id) continue;
          try {
            const message = `✅ Спасибо за участие в *${event.title}*!\n\n` +
              `Мы рады, что вы были с нами.\n` +
              `Следите за новыми событиями от ${orgName}.\n\n` +
              `📅 Все события: ${baseUrl}/p/${event.org_id}/events`;

            const result = await telegramService.sendMessage(p.tg_user_id, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
            if (result.ok) totalSent++;
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err) {
            // Skip errors for individual participants
          }
        }
      }

      // Mark no-shows (optional: send gentle follow-up)
      if (noShowRegs && noShowRegs.length > 0) {
        // Update status to no_show for registrations that didn't check in
        const noShowIds = noShowRegs.map((r: any) => r.participant_id);
        
        // Only mark as no_show if event has check-ins (otherwise we can't determine no-shows)
        if (attendedRegs && attendedRegs.length > 0) {
          await adminSupabase
            .from('event_registrations')
            .update({ status: 'no_show' })
            .eq('event_id', event.id)
            .eq('status', 'registered');

          logger.info({
            event_id: event.id,
            event_title: event.title,
            no_show_count: noShowRegs.length,
            attended_count: attendedRegs.length
          }, '📊 Marked no-shows for event');
        }
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Follow-up ${event.id}: ${errorMsg}`);
    }
  }

  return totalSent;
}

// ===== CORE: Send reminder to all participants of an event =====
async function sendReminderToParticipants({
  adminSupabase, telegramService, logger, event, orgName, reminderType, errors
}: {
  adminSupabase: any;
  telegramService: TelegramService;
  logger: any;
  event: any;
  orgName: string;
  reminderType: string;
  errors: string[];
}): Promise<number> {
  let sent = 0;

  try {
    // Get registrations
    const { data: regsRaw, error: regsError } = await adminSupabase
      .from('event_registrations')
      .select('id, payment_status, participant_id')
      .eq('event_id', event.id)
      .eq('status', 'registered');

    if (regsError || !regsRaw || regsRaw.length === 0) return 0;

    // Get participant data
    const participantIds = regsRaw.map((r: any) => r.participant_id).filter(Boolean);
    const { data: participants } = await adminSupabase
      .from('participants')
      .select('id, tg_user_id, full_name, merged_into')
      .in('id', participantIds)
      .is('merged_into', null);

    const participantsMap = new Map(participants?.map((p: any) => [p.id, p]) || []);

    // Filter valid registrations
    const validRegs = regsRaw
      .filter((r: any) => {
        const p = participantsMap.get(r.participant_id);
        return p && p.tg_user_id;
      });

    if (validRegs.length === 0) return 0;

    logger.info({ 
      event_id: event.id,
      event_title: event.title,
      reminder_type: reminderType,
      count: validRegs.length
    }, `📨 Sending ${reminderType} reminders`);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
    const eventUrl = `${baseUrl}/p/${event.org_id}/events/${event.id}`;

    for (const reg of validRegs) {
      try {
        const participant = participantsMap.get(reg.participant_id);
        if (!participant?.tg_user_id) continue;

        const eventDate = new Date(event.event_date);
        const formattedDate = eventDate.toLocaleDateString('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        const formattedTime = event.start_time?.substring(0, 5) || '';

        const isPaid = event.requires_payment;
        const needsPayment = isPaid && reg.payment_status !== 'paid';

        let message = '';
        if (reminderType === '24h') {
          message = `🔔 Напоминание о событии!\n\n` +
            `*${event.title}*\n\n` +
            `📅 Завтра, ${formattedDate}\n` +
            `🕐 ${formattedTime}\n`;
        } else if (reminderType === '1h') {
          message = `⏰ Через час начинается!\n\n` +
            `*${event.title}*\n\n` +
            `📅 Сегодня в ${formattedTime}\n`;
        }

        if (event.location_info) {
          message += `📍 ${event.location_info}\n`;
        }

        message += `\n`;

        if (needsPayment) {
          message += `💳 Не забудьте оплатить участие!\n\n`;
        }

        message += `Подробнее: ${eventUrl}\n`;
        if (orgName) message += `Организатор: ${orgName}\n`;
        message += `\nДо встречи! 🙌`;

        const result = await telegramService.sendMessage(participant.tg_user_id, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });

        if (result.ok) {
          sent++;
        } else {
          logger.debug({ 
            tg_user_id: participant.tg_user_id,
            error: result.description
          }, 'Failed to send personal reminder');
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (participantError: any) {
        // Don't fail the whole batch for one participant
      }
    }
  } catch (eventError: any) {
    errors.push(`Event ${event.id}: ${eventError.message}`);
  }

  return sent;
}
