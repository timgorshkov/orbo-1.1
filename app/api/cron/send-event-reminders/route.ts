import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cron job to send event reminders 24 hours before event
// Runs daily at 9:00 AM
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Event Reminders] Starting cron job...');

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

    console.log('[Event Reminders] Checking for events between', tomorrow.toISOString(), 'and', dayAfterTomorrow.toISOString());

    // Fetch published events happening tomorrow
    const { data: events, error: eventsError } = await adminSupabase
      .from('events')
      .select(`
        id,
        title,
        event_date,
        start_time,
        org_id,
        location_info,
        requires_payment,
        organizations!inner(
          id,
          name
        )
      `)
      .eq('status', 'published')
      .gte('event_date', tomorrow.toISOString().split('T')[0])
      .lt('event_date', dayAfterTomorrow.toISOString().split('T')[0]);

    if (eventsError) {
      console.error('[Event Reminders] Error fetching events:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    if (!events || events.length === 0) {
      console.log('[Event Reminders] No events found for tomorrow');
      return NextResponse.json({ message: 'No events to remind about', sent: 0 });
    }

    console.log(`[Event Reminders] Found ${events.length} events for tomorrow`);

    let totalSent = 0;
    const errors: string[] = [];

    // For each event, get registrations and send reminders
    for (const event of events) {
      try {
        console.log(`[Event Reminders] Processing event: ${event.title} (${event.id})`);

        // Get registrations for this event
        const { data: registrations, error: regsError } = await adminSupabase
          .from('event_registrations')
          .select(`
            id,
            payment_status,
            participants!inner(
              id,
              tg_user_id,
              full_name,
              merged_into
            )
          `)
          .eq('event_id', event.id)
          .eq('status', 'registered');

        if (regsError) {
          console.error(`[Event Reminders] Error fetching registrations for event ${event.id}:`, regsError);
          errors.push(`Event ${event.id}: ${regsError.message}`);
          continue;
        }

        if (!registrations || registrations.length === 0) {
          console.log(`[Event Reminders] No registrations for event ${event.title}`);
          continue;
        }

        // Filter out merged participants and those without telegram
        const validRegistrations = registrations.filter(
          (reg: any) => reg.participants?.merged_into === null && reg.participants?.tg_user_id
        );

        console.log(`[Event Reminders] Sending ${validRegistrations.length} reminders for event ${event.title}`);

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
            const eventUrl = `https://app.orbo.ru/p/${event.org_id}/events/${event.id}`;
            
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
              console.log(`[Event Reminders] ✅ Sent reminder to ${participant.full_name || tgUserId} for event ${event.title}`);
              totalSent++;
            } else {
              console.error(`[Event Reminders] ❌ Failed to send reminder to ${tgUserId}:`, result.description);
              errors.push(`Participant ${tgUserId}: ${result.description}`);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (participantError: any) {
            console.error('[Event Reminders] Error sending to participant:', participantError);
            errors.push(`Participant error: ${participantError.message}`);
          }
        }

      } catch (eventError: any) {
        console.error(`[Event Reminders] Error processing event ${event.id}:`, eventError);
        errors.push(`Event ${event.id}: ${eventError.message}`);
      }
    }

    console.log(`[Event Reminders] Completed. Sent ${totalSent} reminders.`);

    return NextResponse.json({
      success: true,
      message: `Sent ${totalSent} event reminders`,
      sent: totalSent,
      events: events.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('[Event Reminders] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

