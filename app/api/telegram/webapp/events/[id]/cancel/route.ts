import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { validateInitData, getEventBotToken } from '@/lib/telegram/webAppAuth';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const eventId = params.id;
  
  try {
    // Get Telegram initData from header
    const initDataString = request.headers.get('X-Telegram-Init-Data');
    
    if (!initDataString) {
      return NextResponse.json({ error: 'Telegram auth required' }, { status: 401 });
    }
    
    // Validate Telegram WebApp data
    const botToken = getEventBotToken();
    if (!botToken) {
      logger.error({ event_id: eventId }, 'Event bot token not configured');
      return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
    }
    
    const initData = validateInitData(initDataString, botToken);
    if (!initData?.user) {
      return NextResponse.json({ error: 'Invalid Telegram auth' }, { status: 401 });
    }
    
    const telegramUser = initData.user;
    
    logger.info({
      event_id: eventId,
      telegram_user_id: telegramUser.id,
      telegram_username: telegramUser.username
    }, 'Processing registration cancellation');
    
    const adminSupabase = createAdminServer();
    
    // Get event to find org_id
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('id, org_id, title')
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    
    // Find participant by tg_user_id in this org
    const { data: participant, error: participantError } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('tg_user_id', telegramUser.id)
      .is('merged_into', null)
      .maybeSingle();
    
    if (participantError || !participant) {
      logger.warn({
        event_id: eventId,
        telegram_user_id: telegramUser.id,
        error: participantError?.message
      }, 'Participant not found for cancellation');
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }
    
    // Find and delete registration
    const { data: registration, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('participant_id', participant.id)
      .maybeSingle();
    
    if (regError || !registration) {
      logger.warn({
        event_id: eventId,
        participant_id: participant.id
      }, 'Registration not found for cancellation');
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }
    
    // Update registration status to cancelled
    const { error: updateError } = await adminSupabase
      .from('event_registrations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', registration.id);
    
    if (updateError) {
      logger.error({
        event_id: eventId,
        registration_id: registration.id,
        error: updateError.message
      }, 'Failed to cancel registration');
      return NextResponse.json({ error: 'Failed to cancel registration' }, { status: 500 });
    }
    
    logger.info({
      event_id: eventId,
      participant_id: participant.id,
      registration_id: registration.id,
      event_title: event.title
    }, 'Registration cancelled successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Registration cancelled'
    });
    
  } catch (error: any) {
    logger.error({
      event_id: eventId,
      error: error.message,
      stack: error.stack
    }, 'Error cancelling registration');
    
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}

