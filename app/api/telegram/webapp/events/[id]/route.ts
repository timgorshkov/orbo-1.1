import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { validateInitData, getEventBotToken } from '@/lib/telegram/webAppAuth';
import { createAPILogger } from '@/lib/logger';

/**
 * GET /api/telegram/webapp/events/[id]
 * Get event details for Telegram MiniApp
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/webapp/events/[id]' });
  const eventId = params.id;
  
  try {
    const adminSupabase = createAdminServer();
    
    // Get initData from header (optional for viewing, required for registration)
    const initDataString = request.headers.get('X-Telegram-Init-Data') || '';
    
    let telegramUser = null;
    let isValidated = false;
    
    // Validate initData if provided
    if (initDataString) {
      const botToken = getEventBotToken();
      if (botToken) {
        const initData = validateInitData(initDataString, botToken);
        if (initData?.user) {
          telegramUser = initData.user;
          isValidated = true;
        }
      }
    }
    
    // Get event details
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select(`
        id,
        title,
        description,
        cover_image_url,
        event_type,
        location_info,
        map_link,
        event_date,
        end_date,
        start_time,
        end_time,
        is_paid,
        requires_payment,
        default_price,
        currency,
        payment_link,
        payment_instructions,
        capacity,
        capacity_count_by_paid,
        status,
        org_id,
        organizations!inner(name)
      `)
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      logger.warn({ event_id: eventId }, 'Event not found');
      return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
    }
    
    // Check if event is published
    if (event.status !== 'published') {
      return NextResponse.json({ error: 'Событие недоступно' }, { status: 400 });
    }
    
    // Get registration count
    const { data: regCount } = await adminSupabase
      .rpc('get_event_registered_count', {
        event_uuid: eventId,
        count_by_paid: event.capacity_count_by_paid || false
      });
    
    // Get registration fields
    const { data: fields } = await adminSupabase
      .from('event_registration_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('field_order', { ascending: true });
    
    // Check if user is already registered
    let isRegistered = false;
    if (telegramUser) {
      // Find participant by telegram_user_id
      const { data: participant } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('tg_user_id', telegramUser.id)
        .is('merged_into', null)
        .maybeSingle();
      
      if (participant) {
        const { data: registration } = await adminSupabase
          .from('event_registrations')
          .select('id, status')
          .eq('event_id', eventId)
          .eq('participant_id', participant.id)
          .eq('status', 'registered')
          .maybeSingle();
        
        isRegistered = !!registration;
      }
    }
    
    // Format response
    const response = {
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        cover_image_url: event.cover_image_url,
        event_type: event.event_type,
        location_info: event.location_info,
        map_link: event.map_link,
        event_date: event.event_date,
        end_date: event.end_date,
        start_time: event.start_time,
        end_time: event.end_time,
        is_paid: event.is_paid,
        requires_payment: event.requires_payment,
        default_price: event.default_price,
        currency: event.currency || 'RUB',
        payment_link: event.payment_link,
        payment_instructions: event.payment_instructions,
        capacity: event.capacity,
        registered_count: regCount || 0,
        status: event.status,
        org_name: (event.organizations as any)?.name,
      },
      fields: fields || [],
      isRegistered,
      isValidated,
    };
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    logger.error({ error: error.message, event_id: eventId }, 'Error loading event for MiniApp');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

