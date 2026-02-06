import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createAPILogger } from '@/lib/logger';

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

      return {
        ...reg,
        payment_deadline,
        is_overdue,
        participants: participantsMap.get(reg.participant_id) || null
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

    // Get registration and verify event ownership
    const { data: registration, error: regError } = await supabase
      .from('event_registrations')
      .select('id, event_id, events:event_id (org_id)')
      .eq('id', registration_id)
      .single();

    if (regError || !registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const orgId = (registration.events as any)?.org_id;

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
    const { error: updateError } = await supabase
      .from('event_registrations')
      .update(updateData)
      .eq('id', registration_id);

    if (updateError) {
      logger.error({ error: updateError.message, registration_id }, 'Failed to update payment');
      return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 });
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
