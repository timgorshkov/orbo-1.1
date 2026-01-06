import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { createCronLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cron job to send event reminders 24 hours before event
// Runs daily at 9:00 AM
export async function GET(request: NextRequest) {
  const logger = createCronLogger('send-event-reminders');
  
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info({}, 'Starting cron job');

    const adminSupabase = createAdminServer();
    const telegramService = new TelegramService('main');

    // Get current time and 24-25 hours from now (to catch events in the next day)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Start of tomorrow

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    dayAfterTomorrow.setHours(0, 0, 0, 0); // Start of day after tomorrow

    logger.debug({ 
      start_date: tomorrow.toISOString(),
      end_date: dayAfterTomorrow.toISOString()
    }, 'Checking for events');

    // Fetch published events happening tomorrow
    const { data: eventsRaw, error: eventsError } = await adminSupabase
      .from('events')
      .select('id, title, event_date, start_time, org_id, location_info, requires_payment')
      .eq('status', 'published')
      .gte('event_date', tomorrow.toISOString().split('T')[0])
      .lt('event_date', dayAfterTomorrow.toISOString().split('T')[0]);

    if (eventsError) {
      logger.error({ error: eventsError.message }, 'Error fetching events');
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    if (!eventsRaw || eventsRaw.length === 0) {
      logger.info({}, 'No events found for tomorrow');
      return NextResponse.json({ message: 'No events to remind about', sent: 0 });
    }

    // Получаем данные организаций
    const orgIds = [...new Set(eventsRaw.map(e => e.org_id))];
    const { data: orgs } = await adminSupabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);
    
    const orgsMap = new Map(orgs?.map(o => [o.id, o]) || []);
    const events = eventsRaw.map(e => ({
      ...e,
      organizations: orgsMap.get(e.org_id) || null
    }));

    logger.info({ events_count: events.length }, 'Found events for tomorrow');

    let totalSent = 0;
    const errors: string[] = [];

    // For each event, get registrations and send reminders
    for (const event of events) {
      try {
        logger.debug({ event_id: event.id, event_title: event.title }, 'Processing event');

        // Get registrations for this event
        const { data: regsRaw, error: regsError } = await adminSupabase
          .from('event_registrations')
          .select('id, payment_status, participant_id')
          .eq('event_id', event.id)
          .eq('status', 'registered');

        if (regsError) {
          logger.error({ event_id: event.id, error: regsError.message }, 'Error fetching registrations');
          errors.push(`Event ${event.id}: ${regsError.message}`);
          continue;
        }

        if (!regsRaw || regsRaw.length === 0) {
          logger.debug({ event_id: event.id, event_title: event.title }, 'No registrations for event');
          continue;
        }

        // Получаем данные участников
        const participantIds = regsRaw.map(r => r.participant_id).filter(Boolean);
        const { data: participants } = await adminSupabase
          .from('participants')
          .select('id, tg_user_id, full_name, merged_into')
          .in('id', participantIds)
          .is('merged_into', null);
        
        const participantsMap = new Map(participants?.map(p => [p.id, p]) || []);
        const registrations = regsRaw
          .filter(r => participantsMap.has(r.participant_id))
          .map(r => ({
            ...r,
            participants: participantsMap.get(r.participant_id)
          }));

        // Filter out merged participants and those without telegram
        const validRegistrations = registrations.filter(
          (reg: any) => reg.participants?.merged_into === null && reg.participants?.tg_user_id
        );

        logger.info({ 
          event_id: event.id,
          event_title: event.title,
          reminders_count: validRegistrations.length
        }, 'Sending reminders for event');

        // Send reminder to each registered participant
        for (const registration of validRegistrations) {
          try {
            const participant = (registration as any).participants;
            const tgUserId = participant?.tg_user_id;

            if (!tgUserId) continue;

            const eventDate = new Date(event.event_date);
            const formattedDate = eventDate.toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });
            const formattedTime = event.start_time.substring(0, 5);

            // Build event URL
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru';
            const eventUrl = `${baseUrl}/p/${event.org_id}/events/${event.id}`;
            
            // Check payment status
            const isPaid = (event as any).requires_payment;
            const paymentStatus = (registration as any).payment_status;
            const needsPayment = isPaid && paymentStatus !== 'paid';

            let message = `🔔 Напоминание о событии!\n\n` +
              `*${event.title}*\n\n` +
              `📅 Завтра, ${formattedDate}\n` +
              `🕐 ${formattedTime}\n`;
            
            if (event.location_info) {
              message += `📍 ${event.location_info}\n`;
            }
            
            message += `\n`;
            
            if (needsPayment) {
              message += `💳 Не забудьте оплатить участие!\n\n`;
            }
            
            message += `Подробнее: ${eventUrl}\n\n`;
            message += `Организатор: ${(event.organizations as any).name}\n\n`;
            message += `До встречи на событии!`;

            const result = await telegramService.sendMessage(tgUserId, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: false
            });

            if (result.ok) {
              logger.debug({ 
                tg_user_id: tgUserId,
                participant_name: participant.full_name,
                event_id: event.id,
                event_title: event.title
              }, 'Sent reminder');
              totalSent++;
            } else {
              logger.warn({ 
                tg_user_id: tgUserId,
                event_id: event.id,
                error: result.description
              }, 'Failed to send reminder');
              errors.push(`Participant ${tgUserId}: ${result.description}`);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (participantError: any) {
            logger.error({ 
              error: participantError.message || String(participantError),
              stack: participantError.stack
            }, 'Error sending to participant');
            errors.push(`Participant error: ${participantError.message}`);
          }
        }

      } catch (eventError: any) {
        logger.error({ 
          event_id: event.id,
          error: eventError.message || String(eventError),
          stack: eventError.stack
        }, 'Error processing event');
        errors.push(`Event ${event.id}: ${eventError.message}`);
      }
    }

    logger.info({ 
      sent: totalSent,
      events_count: events.length,
      errors_count: errors.length
    }, 'Completed sending reminders');

    return NextResponse.json({
      success: true,
      message: `Sent ${totalSent} event reminders`,
      sent: totalSent,
      events: events.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Fatal error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

