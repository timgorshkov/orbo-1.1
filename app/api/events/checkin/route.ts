import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic';

// GET /api/events/checkin?token=... — Fetch registration info for check-in verification
// Used by the check-in page to display participant info before confirming
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/events/checkin' });
  
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabase = createAdminServer()

  try {
    // Find registration by qr_token
    const { data: registration, error } = await supabase
      .from('event_registrations')
      .select(`
        id, event_id, participant_id, status, payment_status, paid_amount, price,
        quantity, registered_at, checked_in_at, qr_token
      `)
      .eq('qr_token', token)
      .single()

    if (error || !registration) {
      logger.warn({ token: token.substring(0, 8) + '...' }, 'Invalid checkin token');
      return NextResponse.json({ 
        error: 'Билет не найден',
        error_code: 'INVALID_TOKEN'
      }, { status: 404 })
    }

    // Load event info
    const { data: event } = await supabase
      .from('events')
      .select('id, title, event_date, start_time, end_time, location_info, org_id, event_type, requires_payment')
      .eq('id', registration.event_id)
      .single()

    // Load participant info
    const { data: participant } = await supabase
      .from('participants')
      .select('id, full_name, username, photo_url, tg_user_id, email, phone')
      .eq('id', registration.participant_id)
      .single()

    const isAlreadyCheckedIn = registration.status === 'attended'

    logger.info({ 
      registration_id: registration.id, 
      event_id: registration.event_id,
      status: registration.status,
      is_already_checked_in: isAlreadyCheckedIn
    }, 'Check-in data fetched');

    return NextResponse.json({
      registration: {
        id: registration.id,
        status: registration.status,
        payment_status: registration.payment_status,
        paid_amount: Number(registration.paid_amount) || 0,
        price: Number(registration.price) || 0,
        quantity: registration.quantity || 1,
        registered_at: registration.registered_at,
        checked_in_at: registration.checked_in_at,
        is_already_checked_in: isAlreadyCheckedIn
      },
      event: event ? {
        id: event.id,
        title: event.title,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        location_info: event.location_info,
        org_id: event.org_id,
        event_type: event.event_type,
        requires_payment: event.requires_payment
      } : null,
      participant: participant ? {
        id: participant.id,
        full_name: participant.full_name,
        username: participant.username,
        photo_url: participant.photo_url,
        email: participant.email,
        phone: participant.phone
      } : null
    })

  } catch (e) {
    logger.error({ 
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined
    }, 'Checkin GET error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/events/checkin — Confirm check-in (admin action)
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/events/checkin' });

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const supabase = createAdminServer()

    // Find registration by qr_token
    const { data: registration, error } = await supabase
      .from('event_registrations')
      .select('id, event_id, participant_id, status, checked_in_at')
      .eq('qr_token', token)
      .single()

    if (error || !registration) {
      logger.warn({ token: token.substring(0, 8) + '...' }, 'Invalid checkin token for POST');
      return NextResponse.json({ 
        error: 'Билет не найден',
        error_code: 'INVALID_TOKEN'
      }, { status: 404 })
    }

    // Get event to check admin access
    const { data: event } = await supabase
      .from('events')
      .select('id, org_id, title')
      .eq('id', registration.event_id)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check that user is admin of the org
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', event.org_id)
      .eq('user_id', user.id)
      .single()

    const role = membership?.role || 'guest'
    if (role !== 'owner' && role !== 'admin') {
      logger.warn({ user_id: user.id, org_id: event.org_id, role }, 'Non-admin attempted check-in');
      return NextResponse.json({ error: 'Forbidden — only admins can perform check-in' }, { status: 403 })
    }

    // Check if already checked in
    if (registration.status === 'attended') {
      logger.info({ registration_id: registration.id }, 'Already checked in');
      return NextResponse.json({
        success: true,
        already_checked_in: true,
        checked_in_at: registration.checked_in_at,
        message: 'Участник уже прошёл'
      })
    }

    // Check if registration is valid (not cancelled)
    if (registration.status === 'cancelled' || registration.status === 'no_show') {
      return NextResponse.json({
        error: `Регистрация в статусе "${registration.status}" — чек-ин невозможен`,
        error_code: 'INVALID_STATUS'
      }, { status: 400 })
    }

    // Perform check-in
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('event_registrations')
      .update({ 
        status: 'attended',
        checked_in_at: now
      })
      .eq('id', registration.id)

    if (updateError) {
      logger.error({ error: updateError.message, registration_id: registration.id }, 'Error updating checkin status');
      return NextResponse.json({ error: 'Failed to check in' }, { status: 500 })
    }

    logger.info({ 
      registration_id: registration.id, 
      event_id: registration.event_id,
      participant_id: registration.participant_id,
      checked_in_by: user.id
    }, 'Check-in successful');

    return NextResponse.json({
      success: true,
      already_checked_in: false,
      checked_in_at: now,
      message: 'Участник отмечен'
    })

  } catch (e) {
    logger.error({ 
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined
    }, 'Checkin POST error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
