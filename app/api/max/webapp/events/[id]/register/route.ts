import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { validateMaxInitData, getMaxEventBotToken, MaxWebAppUser } from '@/lib/max/webAppAuth';
import { createAPILogger } from '@/lib/logger';

/**
 * POST /api/max/webapp/events/[id]/register
 * Register for event via MAX MiniApp
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/max/webapp/events/[id]/register' });
  const { id: eventId } = await params;

  try {
    const adminSupabase = createAdminServer();

    const initDataString = request.headers.get('X-Max-Init-Data');
    if (!initDataString) {
      logger.warn({ event_id: eventId }, 'Missing initData');
      return NextResponse.json({ error: 'Требуется авторизация через MAX' }, { status: 401 });
    }

    const botToken = getMaxEventBotToken();
    if (!botToken) {
      logger.error({}, 'MAX_EVENT_BOT_TOKEN not configured');
      return NextResponse.json({ error: 'Сервис временно недоступен' }, { status: 500 });
    }

    const initData = validateMaxInitData(initDataString, botToken);
    if (!initData?.user) {
      logger.warn({ event_id: eventId }, 'Invalid initData');
      return NextResponse.json({ error: 'Недействительная авторизация' }, { status: 401 });
    }

    const maxUser: MaxWebAppUser = initData.user;

    const body = await request.json().catch(() => ({}));
    const registrationData = body.registration_data || {};
    const quantity = Math.min(Math.max(parseInt(body.quantity) || 1, 1), 5);
    const pdConsent = body.pd_consent === true;
    const announcementsConsent = body.announcements_consent === true;

    // Get event
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
    }
    if (event.status !== 'published') {
      return NextResponse.json({ error: 'Регистрация закрыта' }, { status: 400 });
    }

    // Check capacity
    if (event.capacity) {
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

    // Find or create participant by max_user_id
    let participant = null;
    const { data: existingParticipant } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('max_user_id', maxUser.id)
      .is('merged_into', null)
      .maybeSingle();

    if (existingParticipant) {
      participant = existingParticipant;
      const fullName = [maxUser.first_name, maxUser.last_name].filter(Boolean).join(' ');
      await adminSupabase
        .from('participants')
        .update({ username: maxUser.username || null, full_name: fullName })
        .eq('id', participant.id);
    } else {
      const fullName = [maxUser.first_name, maxUser.last_name].filter(Boolean).join(' ');
      const { data: newParticipant, error: createError } = await adminSupabase
        .from('participants')
        .insert({
          org_id: event.org_id,
          max_user_id: maxUser.id,
          username: maxUser.username || null,
          full_name: fullName || `User ${maxUser.id}`,
          source: 'max_miniapp',
          participant_status: 'event_attendee',
        })
        .select('id')
        .single();

      if (createError) {
        if (createError.code === '23505') {
          const { data: raceP } = await adminSupabase
            .from('participants')
            .select('id')
            .eq('org_id', event.org_id)
            .eq('max_user_id', maxUser.id)
            .is('merged_into', null)
            .maybeSingle();
          participant = raceP;
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

    // Check existing registration
    const { data: existingRegistration } = await adminSupabase
      .from('event_registrations')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('participant_id', participant.id)
      .maybeSingle();

    if (existingRegistration) {
      if (existingRegistration.status === 'registered') {
        return NextResponse.json({ success: true, message: 'Вы уже зарегистрированы', registration: existingRegistration });
      }

      const reactivateData: Record<string, unknown> = {
        status: 'registered',
        registered_at: new Date().toISOString(),
        registration_data: registrationData,
        quantity,
        registration_source: 'max_miniapp',
        messenger_type: 'max',
      };
      if (pdConsent) reactivateData.pd_consent_at = new Date().toISOString();

      const { data: updatedReg, error: updateError } = await adminSupabase
        .from('event_registrations')
        .update(reactivateData)
        .eq('id', existingRegistration.id)
        .select('id, qr_token, payment_status')
        .single();

      if (updateError) {
        logger.error({ error: updateError.message }, 'Error updating registration');
        return NextResponse.json({ error: 'Ошибка регистрации' }, { status: 500 });
      }

      if (announcementsConsent) {
        await adminSupabase.from('participants')
          .update({ announcements_consent_granted_at: new Date().toISOString(), announcements_consent_revoked_at: null })
          .eq('id', participant.id).catch(() => {});
      }

      logger.info({ event_id: eventId, participant_id: participant.id, max_user_id: maxUser.id, pd_consent: pdConsent, announcements_consent: announcementsConsent }, '✅ Registration reactivated via MAX MiniApp');
      return NextResponse.json({
        success: true,
        message: 'Регистрация восстановлена',
        registration: { id: updatedReg?.id, qr_token: updatedReg?.qr_token, status: 'registered', payment_status: updatedReg?.payment_status },
      });
    }

    // Create new registration via RPC
    const { data: registrationResult, error: rpcError } = await adminSupabase
      .rpc('register_for_event', {
        p_event_id: eventId,
        p_participant_id: participant.id,
        p_registration_data: registrationData,
        p_quantity: quantity,
      });

    if (rpcError) {
      if (rpcError.code === '23505' || rpcError.message?.includes('duplicate')) {
        return NextResponse.json({ success: true, message: 'Вы уже зарегистрированы' });
      }
      logger.error({ error: rpcError.message }, 'Error creating registration via RPC');
      return NextResponse.json({ error: 'Ошибка регистрации' }, { status: 500 });
    }

    const registrationRow = Array.isArray(registrationResult) && registrationResult.length > 0
      ? registrationResult[0]
      : registrationResult;

    let qrToken = registrationRow?.registration_qr_token || null;
    let paymentStatus = null;

    if (registrationRow?.registration_id) {
      const regUpdate: Record<string, unknown> = { registration_source: 'max_miniapp', messenger_type: 'max' };
      if (event.default_price) regUpdate.price = event.default_price;
      if (pdConsent) regUpdate.pd_consent_at = new Date().toISOString();
      const { data: updatedReg } = await adminSupabase
        .from('event_registrations')
        .update(regUpdate)
        .eq('id', registrationRow.registration_id)
        .select('qr_token, payment_status')
        .single();

      if (updatedReg) {
        qrToken = updatedReg.qr_token;
        paymentStatus = updatedReg.payment_status;
      }
    }

    if (announcementsConsent && participant?.id) {
      await adminSupabase.from('participants')
        .update({ announcements_consent_granted_at: new Date().toISOString(), announcements_consent_revoked_at: null })
        .eq('id', participant.id).catch(() => {});
    }

    logger.info({
      event_id: eventId, participant_id: participant.id,
      max_user_id: maxUser.id, username: maxUser.username, qr_token: qrToken,
      pd_consent: pdConsent, announcements_consent: announcementsConsent,
    }, '✅ New registration via MAX MiniApp');

    return NextResponse.json({
      success: true,
      message: 'Вы успешно зарегистрированы!',
      registration: { id: registrationRow?.registration_id, qr_token: qrToken, status: 'registered', payment_status: paymentStatus },
    }, { status: 201 });

  } catch (error: any) {
    logger.error({ error: error.message, event_id: eventId }, 'Error registering via MAX MiniApp');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
