import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { auth } from '@/auth';
import { getEffectiveOrgRole } from '@/lib/server/orgAccess';
import { createEventReminders } from '@/lib/services/announcementService';
import { getOrgAnnouncementDefaults } from '@/lib/services/recurringEventsService';
import { createAPILogger } from '@/lib/logger';

/**
 * POST /api/events/[id]/create-reminders
 * Creates 24h and 1h reminder announcements for an existing event.
 * Used by the "Создать анонсы" action in the event share menu.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/create-reminders' });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createAdminServer();

    // Fetch event
    const { data: event, error: eventError } = await db
      .from('events')
      .select('id, org_id, title, description, event_date, start_time, location_info, event_type')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check access
    const role = await getEffectiveOrgRole(session.user.id, event.org_id);
    if (!role || !['owner', 'admin'].includes(role.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const useMiniAppLink: boolean = body.use_miniapp_link !== false;

    // Get default target groups and topics for announcements
    const { targetGroups, targetTopics } = await getOrgAnnouncementDefaults(event.org_id);

    if (targetGroups.length === 0) {
      return NextResponse.json(
        { error: 'Нет подключённых Telegram-групп. Подключите хотя бы одну группу в разделе «Telegram».' },
        { status: 422 }
      );
    }

    // Build event start datetime (Moscow time)
    const dateStr = typeof event.event_date === 'string'
      ? event.event_date.split('T')[0]
      : new Date(event.event_date).toISOString().split('T')[0];

    const timeStr = event.start_time
      ? event.start_time.substring(0, 5)
      : '10:00';

    const eventStartTime = new Date(`${dateStr}T${timeStr}:00+03:00`);

    if (isNaN(eventStartTime.getTime())) {
      return NextResponse.json({ error: 'Invalid event date/time' }, { status: 400 });
    }

    const now = new Date();
    const reminder24h = new Date(eventStartTime.getTime() - 24 * 60 * 60 * 1000);
    const reminder1h = new Date(eventStartTime.getTime() - 60 * 60 * 1000);
    const created: string[] = [];

    if (reminder24h <= now && reminder1h <= now) {
      return NextResponse.json(
        { error: 'Оба времени напоминания уже в прошлом. Напоминания не созданы.' },
        { status: 422 }
      );
    }

    await createEventReminders(
      event.id,
      event.org_id,
      event.title,
      event.description,
      eventStartTime,
      event.location_info,
      targetGroups,
      useMiniAppLink,
      event.event_type ?? 'offline',
      targetTopics
    );

    if (reminder24h > now) created.push('за 24 часа');
    if (reminder1h > now) created.push('за 1 час');

    logger.info({ event_id: eventId, created, use_miniapp_link: useMiniAppLink }, 'Reminders created via share menu');

    return NextResponse.json({ ok: true, created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg, event_id: eventId }, 'Failed to create reminders');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
