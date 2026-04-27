import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'

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

// POST /api/events/checkin — Confirm check-in (admin or registrator)
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/events/checkin' });

  try {
    // Auth: read BOTH NextAuth and registrator sessions in parallel — the same browser
    // can hold both (e.g. an org member who is also assigned as a registrator).
    // We grant access if either path authorises the request for this event's org.
    const { getRegistratorSession } = await import('@/lib/registrator-auth/session')
    const [user, registratorSession] = await Promise.all([
      getUnifiedUser(),
      getRegistratorSession(),
    ])

    if (!user && !registratorSession) {
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

    // Get event to check access
    const { data: event } = await supabase
      .from('events')
      .select('id, org_id, title')
      .eq('id', registration.event_id)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Authorization check — pass if EITHER:
    //   (a) registrator session matches the event's org, OR
    //   (b) the NextAuth user is an admin/owner (incl. virtual superadmin) of the event's org.
    const registratorOrgMatches = registratorSession?.orgId === event.org_id
    let userIsAdmin = false
    let userRole: string | undefined
    if (user) {
      const access = await getEffectiveOrgRole(user.id, event.org_id)
      userRole = access?.role
      userIsAdmin = userRole === 'owner' || userRole === 'admin'
    }

    if (!registratorOrgMatches && !userIsAdmin) {
      logger.warn({
        user_id: user?.id || null,
        registrator_session_id: registratorSession?.sessionId || null,
        registrator_org_id: registratorSession?.orgId || null,
        org_id: event.org_id,
        role: userRole,
      }, 'Check-in forbidden — neither admin role nor matching registrator session');
      return NextResponse.json({
        error: 'Forbidden — only admins or assigned registrators can perform check-in'
      }, { status: 403 })
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

    // Record who did the check-in. Prefer the registrator session if it matches —
    // the registrator role is the more specific one (admin who is also a registrator
    // would still be acting as a registrator at the event door). If the registrator
    // session is for a different org, ignore it for attribution purposes.
    const now = new Date().toISOString()
    const useRegistrator = registratorOrgMatches
    const checkedInByName = useRegistrator
      ? registratorSession!.name
      : (user?.email || user?.name || null)

    const { error: updateError } = await supabase
      .from('event_registrations')
      .update({
        status: 'attended',
        checked_in_at: now,
        checked_in_by_user_id: useRegistrator ? null : (user?.id || null),
        checked_in_by_registrator_id: useRegistrator ? registratorSession!.sessionId : null,
        checked_in_by_name: checkedInByName,
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
      auth_path: useRegistrator ? 'registrator' : 'admin',
      checked_in_by_user_id: useRegistrator ? null : (user?.id || null),
      checked_in_by_registrator_id: useRegistrator ? registratorSession!.sessionId : null,
      checked_in_by_name: checkedInByName,
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
