import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/events/checkin' });
  // Получаем токен из строки запроса
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/?checkin=missing', req.url))
  }

  // Для полной безопасности мы можем хэшировать токен и сравнивать с хранящимся хэшем
  // В MVP для простоты просто проверяем совпадение токена
  const jwtSecret = process.env.JWT_SECRET!
  const hash = crypto.createHash('sha256').update(token + jwtSecret).digest('hex')
  
  const supabase = await createClientServer()

  try {
    // Находим регистрацию по токену
    const { data, error } = await supabase
      .from('event_registrations')
      .select('id, event_id, org_id, status')
      .eq('qr_token', token) // В полной версии можно проверять хэш токена
      .single()

    if (error || !data) {
      logger.error({ error: error?.message, token_hash: hash.substring(0, 8) + '...' }, 'Invalid checkin token');
      return NextResponse.redirect(new URL('/?checkin=invalid', req.url))
    }

    logger.info({ registration_id: data.id, event_id: data.event_id, org_id: data.org_id }, 'Processing checkin');

    // Проверяем, не был ли уже выполнен чек-ин
    if (data.status === 'checked_in') {
      logger.info({ registration_id: data.id }, 'Checkin already completed');
      // Уже отмечен, но перенаправляем на страницу события с сообщением
      return NextResponse.redirect(
        new URL(`/p/${data.org_id}/events/${data.event_id}?checkin=already`, req.url)
      )
    }

    // Обновляем статус на checked_in
    const { error: updateError } = await supabase
      .from('event_registrations')
      .update({ status: 'checked_in' })
      .eq('id', data.id)

    if (updateError) {
      logger.error({ error: updateError.message, registration_id: data.id }, 'Error updating checkin status');
      return NextResponse.redirect(new URL('/?checkin=error', req.url))
    }

    // Записываем событие активности для чек-ина
    await supabase
      .from('activity_events')
      .insert({
        org_id: data.org_id,
        type: 'checkin',
        participant_id: null, // В полной версии тут можно связать с participant_id
        meta: { 
          event_id: data.event_id,
          registration_id: data.id
        }
      })

    logger.info({ registration_id: data.id, event_id: data.event_id }, 'Checkin successful');
    
    // Успешный чек-ин, перенаправляем на страницу события
    return NextResponse.redirect(
      new URL(`/p/${data.org_id}/events/${data.event_id}?checkin=ok`, req.url)
    )

  } catch (e) {
    logger.error({ 
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined
    }, 'Checkin error');
    return NextResponse.redirect(new URL('/?checkin=error', req.url))
  }
}
