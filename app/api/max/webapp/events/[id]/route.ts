import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { validateMaxInitData, getMaxEventBotToken } from '@/lib/max/webAppAuth';
import { createAPILogger } from '@/lib/logger';

/**
 * GET /api/max/webapp/events/[id]
 * Get event details for MAX MiniApp
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/max/webapp/events/[id]' });
  const eventId = params.id;

  try {
    const adminSupabase = createAdminServer();

    const initDataString = request.headers.get('X-Max-Init-Data') || '';
    let maxUser: { id: number; first_name: string; last_name?: string; username?: string } | null = null;
    let isValidated = false;

    if (initDataString) {
      const botToken = getMaxEventBotToken();
      if (!botToken) {
        logger.error({ event_id: eventId }, 'MAX_EVENT_BOT_TOKEN not configured');
      } else {
        const initData = validateMaxInitData(initDataString, botToken);
        if (initData?.user) {
          maxUser = initData.user;
          isValidated = true;
          logger.info({ event_id: eventId, max_user_id: maxUser.id, username: maxUser.username }, 'MAX initData validated');
        } else {
          logger.warn({ event_id: eventId }, 'MAX initData validation failed — proceeding as anonymous');
        }
      }
    } else {
      logger.info({ event_id: eventId }, 'MAX webapp event load — no initData (anonymous)');
    }

    // Get event details
    const { data: eventData, error: eventError } = await adminSupabase
      .from('events')
      .select(`
        id, title, description, cover_image_url, event_type, location_info, map_link,
        event_date, end_date, start_time, end_time, is_paid, requires_payment,
        default_price, currency, payment_link, payment_instructions, capacity,
        capacity_count_by_paid, status, org_id, enable_qr_checkin
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !eventData) {
      logger.warn({ event_id: eventId, error: eventError?.message }, 'Event not found');
      return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
    }

    const { data: orgData } = await adminSupabase
      .from('organizations')
      .select('name')
      .eq('id', eventData.org_id)
      .single();

    if (eventData.status !== 'published') {
      return NextResponse.json({ error: 'Событие недоступно' }, { status: 400 });
    }

    // Registration count
    const { data: regCountData } = await adminSupabase
      .rpc('get_event_registered_count', {
        event_uuid: eventId,
        count_by_paid: eventData.capacity_count_by_paid || false,
      });

    let regCount = 0;
    if (typeof regCountData === 'number') regCount = regCountData;
    else if (Array.isArray(regCountData) && regCountData.length > 0)
      regCount = typeof regCountData[0] === 'number' ? regCountData[0] : 0;

    // Registration fields
    const { data: fields } = await adminSupabase
      .from('event_registration_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('field_order', { ascending: true });

    // Check if already registered (by max_user_id)
    let isRegistered = false;
    let paymentStatus: string | null = null;
    let userRegistration: any = null;

    if (maxUser) {
      const { data: participant } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', eventData.org_id)
        .eq('max_user_id', maxUser.id)
        .is('merged_into', null)
        .maybeSingle();

      if (participant) {
        const { data: registration } = await adminSupabase
          .from('event_registrations')
          .select('id, status, payment_status, qr_token')
          .eq('event_id', eventId)
          .eq('participant_id', participant.id)
          .in('status', ['registered', 'attended'])
          .maybeSingle();

        isRegistered = !!registration;
        paymentStatus = registration?.payment_status || null;
        userRegistration = registration ? {
          id: registration.id,
          status: registration.status,
          payment_status: registration.payment_status,
          qr_token: registration.qr_token,
        } : null;
      }
    }

    logger.info({
      event_id: eventId,
      max_user_id: maxUser?.id ?? null,
      is_validated: isValidated,
      is_registered: isRegistered,
    }, 'MAX webapp event loaded successfully');

    return NextResponse.json({
      event: {
        id: eventData.id,
        title: eventData.title,
        description: eventData.description,
        cover_image_url: eventData.cover_image_url,
        event_type: eventData.event_type,
        location_info: eventData.location_info,
        map_link: eventData.map_link,
        event_date: eventData.event_date,
        end_date: eventData.end_date,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        is_paid: eventData.is_paid,
        requires_payment: eventData.requires_payment,
        default_price: eventData.default_price,
        currency: eventData.currency || 'RUB',
        payment_link: eventData.payment_link,
        payment_instructions: eventData.payment_instructions,
        capacity: eventData.capacity,
        registered_count: regCount || 0,
        status: eventData.status,
        org_id: eventData.org_id,
        org_name: orgData?.name,
        enable_qr_checkin: eventData.enable_qr_checkin,
      },
      fields: fields || [],
      isRegistered,
      isValidated,
      paymentStatus,
      userRegistration,
    });
  } catch (error: any) {
    logger.error({ error: error.message, event_id: eventId }, 'Error loading event for MAX MiniApp');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
