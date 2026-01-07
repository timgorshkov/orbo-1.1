import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { validateInitData, getEventBotToken, TelegramWebAppUser } from '@/lib/telegram/webAppAuth';
import { createAPILogger } from '@/lib/logger';

/**
 * POST /api/telegram/webapp/events/[id]/register
 * Register for event via Telegram MiniApp
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/webapp/events/[id]/register' });
  const eventId = params.id;
  
  try {
    const adminSupabase = createAdminServer();
    
    // Get and validate initData - REQUIRED for registration
    const initDataString = request.headers.get('X-Telegram-Init-Data');
    
    if (!initDataString) {
      logger.warn({ event_id: eventId }, 'Missing initData');
      return NextResponse.json({ error: 'Требуется авторизация через Telegram' }, { status: 401 });
    }
    
    const botToken = getEventBotToken();
    if (!botToken) {
      logger.error({}, 'TELEGRAM_EVENT_BOT_TOKEN not configured');
      return NextResponse.json({ error: 'Сервис временно недоступен' }, { status: 500 });
    }
    
    const initData = validateInitData(initDataString, botToken);
    if (!initData?.user) {
      logger.warn({ event_id: eventId }, 'Invalid initData');
      return NextResponse.json({ error: 'Недействительная авторизация' }, { status: 401 });
    }
    
    const telegramUser: TelegramWebAppUser = initData.user;
    
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const registrationData = body.registration_data || {};
    const quantity = Math.min(Math.max(parseInt(body.quantity) || 1, 1), 5);
    
    // Get event details
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
    }
    
    // Check if event is published
    if (event.status !== 'published') {
      return NextResponse.json({ error: 'Регистрация закрыта' }, { status: 400 });
    }
    
    // Check capacity
    if (event.capacity) {
      // Получаем регистрации отдельно
      const { data: eventRegs } = await adminSupabase
        .from('event_registrations')
        .select('id, status, quantity')
        .eq('event_id', eventId);
      
      const countByPaid = event.capacity_count_by_paid || false;
      let regCount = 0;
      if (countByPaid) {
        regCount = eventRegs?.filter((r: any) => r.status === 'registered' && r.payment_status === 'paid')
          .reduce((sum: number, r: any) => sum + (r.quantity || 1), 0) || 0;
      } else {
        regCount = eventRegs?.filter((r: any) => r.status === 'registered')
          .reduce((sum: number, r: any) => sum + (r.quantity || 1), 0) || 0;
      }
      
      if (regCount + quantity > event.capacity) {
        return NextResponse.json({ error: 'Все места заняты' }, { status: 400 });
      }
    }
    
    // Find or create participant
    let participant = null;
    
    // Try to find existing participant by tg_user_id
    const { data: existingParticipant } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('tg_user_id', telegramUser.id)
      .is('merged_into', null)
      .maybeSingle();
    
    if (existingParticipant) {
      participant = existingParticipant;
      
      // Update participant info from Telegram
      const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
      await adminSupabase
        .from('participants')
        .update({
          username: telegramUser.username || null,
          full_name: fullName,
        })
        .eq('id', participant.id);
    } else {
      // Create new participant
      const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
      
      const { data: newParticipant, error: createError } = await adminSupabase
        .from('participants')
        .insert({
          org_id: event.org_id,
          tg_user_id: telegramUser.id,
          username: telegramUser.username || null,
          full_name: fullName || `User ${telegramUser.id}`,
          source: 'telegram_miniapp',
          participant_status: 'event_attendee',
        })
        .select('id')
        .single();
      
      if (createError) {
        // Handle duplicate (race condition)
        if (createError.code === '23505') {
          const { data: raceParticipant } = await adminSupabase
            .from('participants')
            .select('id')
            .eq('org_id', event.org_id)
            .eq('tg_user_id', telegramUser.id)
            .is('merged_into', null)
            .maybeSingle();
          
          participant = raceParticipant;
        } else {
          logger.error({ error: createError.message }, 'Error creating participant');
          return NextResponse.json({ error: 'Ошибка создания профиля' }, { status: 500 });
        }
      } else {
        participant = newParticipant;
      }
    }
    
    if (!participant) {
      return NextResponse.json({ error: 'Ошибка создания профиля' }, { status: 500 });
    }
    
    // Check if already registered
    const { data: existingRegistration } = await adminSupabase
      .from('event_registrations')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('participant_id', participant.id)
      .maybeSingle();
    
    if (existingRegistration) {
      if (existingRegistration.status === 'registered') {
        return NextResponse.json({ 
          success: true,
          message: 'Вы уже зарегистрированы',
          registration: existingRegistration
        });
      }
      
      // Reactivate cancelled registration
      const { error: updateError } = await adminSupabase
        .from('event_registrations')
        .update({
          status: 'registered',
          registered_at: new Date().toISOString(),
          registration_data: registrationData,
          quantity,
          registration_source: 'telegram_miniapp',
        })
        .eq('id', existingRegistration.id);
      
      if (updateError) {
        logger.error({ error: updateError.message }, 'Error updating registration');
        return NextResponse.json({ error: 'Ошибка регистрации' }, { status: 500 });
      }
      
      logger.info({ 
        event_id: eventId, 
        participant_id: participant.id,
        telegram_user_id: telegramUser.id 
      }, '✅ Registration reactivated via MiniApp');
      
      return NextResponse.json({ 
        success: true,
        message: 'Регистрация восстановлена'
      });
    }
    
    // Create new registration using RPC
    const { data: registrationResult, error: rpcError } = await adminSupabase
      .rpc('register_for_event', {
        p_event_id: eventId,
        p_participant_id: participant.id,
        p_registration_data: registrationData,
        p_quantity: quantity,
      });
    
    if (rpcError) {
      // Handle duplicate
      if (rpcError.code === '23505' || rpcError.message?.includes('duplicate')) {
        return NextResponse.json({ 
          success: true,
          message: 'Вы уже зарегистрированы'
        });
      }
      
      logger.error({ error: rpcError.message }, 'Error creating registration via RPC');
      return NextResponse.json({ error: 'Ошибка регистрации' }, { status: 500 });
    }
    
    // Update registration source
    const registrationRow = Array.isArray(registrationResult) && registrationResult.length > 0
      ? registrationResult[0]
      : registrationResult;
    
    if (registrationRow?.registration_id) {
      await adminSupabase
        .from('event_registrations')
        .update({ registration_source: 'telegram_miniapp' })
        .eq('id', registrationRow.registration_id);
    }
    
    logger.info({ 
      event_id: eventId, 
      participant_id: participant.id,
      telegram_user_id: telegramUser.id,
      username: telegramUser.username
    }, '✅ New registration via MiniApp');
    
    return NextResponse.json({ 
      success: true,
      message: 'Вы успешно зарегистрированы!'
    }, { status: 201 });
    
  } catch (error: any) {
    logger.error({ error: error.message, event_id: eventId }, 'Error registering via MiniApp');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

