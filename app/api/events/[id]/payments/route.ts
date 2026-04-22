import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createAPILogger } from '@/lib/logger';
import { recordEventPayment } from '@/lib/services/orgAccountService';

export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// GET /api/events/[id]/payments - Get payment data for event registrations
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: eventId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/payments', event_id: eventId });

  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminServer();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    // Get event and check org access
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, org_id, requires_payment, event_date, payment_deadline_days')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check user access to org
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', event.org_id)
      .eq('user_id', user.id)
      .single();

    const role = membership?.role || 'guest';
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch registrations
    let query = supabase
      .from('event_registrations')
      .select('id, participant_id, status, registered_at, price, payment_status, payment_method, paid_at, paid_amount, payment_notes, payment_updated_at')
      .eq('event_id', eventId)
      .neq('status', 'cancelled');

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq('payment_status', statusFilter);
    }

    const { data: registrationsRaw, error: regError } = await query.order('registered_at', { ascending: false });

    if (regError) {
      logger.error({ error: regError.message }, 'Failed to fetch registrations');
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
    }

    // Fetch participants data separately
    const participantIds = (registrationsRaw || []).map((r: any) => r.participant_id).filter(Boolean);
    let participantsMap = new Map();

    if (participantIds.length > 0) {
      const { data: participants } = await supabase
        .from('participants')
        .select('id, full_name, username, tg_user_id, photo_url')
        .in('id', participantIds);

      participants?.forEach((p: any) => {
        participantsMap.set(p.id, p);
      });
    }

    // Fetch payment sessions for Orbo-paid registrations
    const regIds = (registrationsRaw || []).map((r: any) => r.id).filter(Boolean)
    let sessionsMap = new Map()
    if (regIds.length > 0) {
      const { data: sessions } = await supabase
        .from('payment_sessions')
        .select('id, event_registration_id, ticket_price, service_fee_amount, service_fee_rate, status, gateway_code, amount')
        .in('event_registration_id', regIds)
        .in('status', ['succeeded', 'refunded'])
      sessions?.forEach((s: any) => {
        sessionsMap.set(s.event_registration_id, s)
      })
    }

    // Calculate payment_deadline and overdue status
    const now = new Date();
    const enrichedRegistrations = (registrationsRaw || []).map((reg: any) => {
      let payment_deadline: string | null = null;
      
      // Calculate deadline: event_date - payment_deadline_days
      if (event.event_date && event.payment_deadline_days !== null) {
        const eventDate = new Date(event.event_date);
        const deadlineDate = new Date(eventDate);
        deadlineDate.setDate(deadlineDate.getDate() - (event.payment_deadline_days || 3));
        payment_deadline = deadlineDate.toISOString();
      }

      const is_overdue = payment_deadline
        ? new Date(payment_deadline) < now && reg.payment_status !== 'paid'
        : false;

      const session = sessionsMap.get(reg.id)

      return {
        ...reg,
        payment_deadline,
        is_overdue,
        participants: participantsMap.get(reg.participant_id) || null,
        // Payment session info for Orbo refunds
        payment_session: session ? {
          id: session.id,
          ticket_price: session.ticket_price ? parseFloat(session.ticket_price) : null,
          service_fee_amount: session.service_fee_amount ? parseFloat(session.service_fee_amount) : null,
          total_amount: session.amount ? parseFloat(session.amount) : null,
          gateway_code: session.gateway_code,
          session_status: session.status,
        } : null,
      };
    });

    logger.info({ 
      event_id: eventId,
      count: enrichedRegistrations.length,
      status_filter: statusFilter
    }, 'Payments data fetched');

    return NextResponse.json({ 
      registrations: enrichedRegistrations 
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in GET /api/events/[id]/payments');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/events/[id]/payments - Update payment information for a registration
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: eventId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/payments', event_id: eventId });

  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      registration_id, 
      price, 
      payment_status, 
      payment_method, 
      paid_amount, 
      payment_notes 
    } = body;

    if (!registration_id) {
      return NextResponse.json({ error: 'Missing registration_id' }, { status: 400 });
    }

    const supabase = createAdminServer();

    // Get registration and verify event ownership (два запроса вместо join)
    const { data: registration, error: regError } = await supabase
      .from('event_registrations')
      .select('id, event_id')
      .eq('id', registration_id)
      .single();

    if (regError || !registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // Получаем org_id из связанного события
    const { data: regEvent } = await supabase
      .from('events')
      .select('org_id')
      .eq('id', registration.event_id)
      .single();

    const orgId = regEvent?.org_id;

    // Check user access to org
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    const role = membership?.role || 'guest';
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Prepare update data
    const updateData: any = {
      payment_updated_at: new Date().toISOString()
    };

    if (price !== undefined) updateData.price = price;
    if (payment_status !== undefined) updateData.payment_status = payment_status;
    if (payment_method !== undefined) updateData.payment_method = payment_method;
    if (paid_amount !== undefined) updateData.paid_amount = paid_amount;
    if (payment_notes !== undefined) updateData.payment_notes = payment_notes;

    // If status is being set to "paid", set paid_at timestamp
    if (payment_status === 'paid' && (!registration || (registration as any).payment_status !== 'paid')) {
      updateData.paid_at = new Date().toISOString();
    }

    // Update registration
    const { data: updatedReg, error: updateError } = await supabase
      .from('event_registrations')
      .update(updateData)
      .eq('id', registration_id)
      .select('id, participant_id, price, paid_amount, payment_status, payment_method')
      .single();

    if (updateError) {
      logger.error({ error: updateError.message, registration_id }, 'Failed to update payment');
      return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 });
    }

    // Record in org account ledger when payment is confirmed as paid
    if (payment_status === 'paid' && updatedReg && orgId) {
      const paymentAmount = updatedReg.paid_amount || updatedReg.price;
      if (paymentAmount && paymentAmount > 0) {
        try {
          await recordEventPayment({
            orgId,
            eventId,
            eventRegistrationId: registration_id,
            participantId: updatedReg.participant_id,
            amount: parseFloat(paymentAmount),
            paymentGateway: updatedReg.payment_method || 'manual',
            confirmedBy: user.id,
          });
        } catch (ledgerError: any) {
          // Don't fail the whole request if ledger recording fails
          logger.error({ error: ledgerError.message, registration_id }, 'Failed to record event payment in ledger');
        }
      }
    }

    // Send registration confirmation after manual payment confirmation (fire-and-forget)
    if (payment_status === 'paid' && updatedReg?.participant_id) {
      import('@/lib/services/registrationConfirmationService').then(({ sendRegistrationConfirmation }) => {
        sendRegistrationConfirmation({
          registrationId: registration_id,
          eventId,
          orgId: orgId!,
          participantId: updatedReg.participant_id,
          qrToken: null,
        }).catch(() => {})
      }).catch(() => {})
    }

    logger.info({
      registration_id,
      event_id: eventId,
      updated_fields: Object.keys(updateData)
    }, 'Payment updated');

    return NextResponse.json({ success: true });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in PATCH /api/events/[id]/payments');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
