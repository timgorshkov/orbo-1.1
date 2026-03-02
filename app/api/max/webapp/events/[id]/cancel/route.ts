import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { validateMaxInitData, getMaxEventBotToken } from '@/lib/max/webAppAuth';
import { createAPILogger } from '@/lib/logger';

/**
 * POST /api/max/webapp/events/[id]/cancel
 * Cancel event registration via MAX MiniApp
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/max/webapp/events/[id]/cancel' });
  const eventId = params.id;

  try {
    const adminSupabase = createAdminServer();

    const initDataString = request.headers.get('X-Max-Init-Data');
    if (!initDataString) {
      return NextResponse.json({ error: 'Требуется авторизация через MAX' }, { status: 401 });
    }

    const botToken = getMaxEventBotToken();
    if (!botToken) {
      return NextResponse.json({ error: 'Сервис временно недоступен' }, { status: 500 });
    }

    const initData = validateMaxInitData(initDataString, botToken);
    if (!initData?.user) {
      return NextResponse.json({ error: 'Недействительная авторизация' }, { status: 401 });
    }

    const maxUserId = initData.user.id;

    // Get event
    const { data: event } = await adminSupabase
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
    }

    // Find participant
    const { data: participant } = await adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', event.org_id)
      .eq('max_user_id', maxUserId)
      .is('merged_into', null)
      .maybeSingle();

    if (!participant) {
      return NextResponse.json({ error: 'Регистрация не найдена' }, { status: 404 });
    }

    // Cancel registration
    const { error: updateError } = await adminSupabase
      .from('event_registrations')
      .update({ status: 'cancelled' })
      .eq('event_id', eventId)
      .eq('participant_id', participant.id)
      .eq('status', 'registered');

    if (updateError) {
      logger.error({ error: updateError.message }, 'Error cancelling registration');
      return NextResponse.json({ error: 'Ошибка отмены' }, { status: 500 });
    }

    logger.info({ event_id: eventId, max_user_id: maxUserId }, '🔴 Registration cancelled via MAX MiniApp');
    return NextResponse.json({ success: true, message: 'Регистрация отменена' });

  } catch (error: any) {
    logger.error({ error: error.message, event_id: eventId }, 'Error cancelling registration');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
