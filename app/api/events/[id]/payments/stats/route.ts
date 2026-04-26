import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { getEffectiveOrgRole } from '@/lib/server/orgAccess';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// GET /api/events/[id]/payments/stats - Get payment statistics for an event
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: eventId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/payments/stats', event_id: eventId });

  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminServer();

    // Get event and check org access
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, org_id, requires_payment, default_price')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check user access to org (incl. virtual owner for superadmins)
    const access = await getEffectiveOrgRole(user.id, event.org_id);
    const role = access?.role;
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all active registrations (not cancelled)
    const { data: registrations, error: regError } = await supabase
      .from('event_registrations')
      .select('price, payment_status, paid_amount, quantity')
      .eq('event_id', eventId)
      .neq('status', 'cancelled');

    if (regError) {
      logger.error({ error: regError.message }, 'Failed to fetch registrations for stats');
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    const regs = registrations || [];

    // Calculate statistics
    const total_registrations = regs.length;
    
    // Calculate expected amount (sum of price * quantity for each registration)
    // Note: PostgreSQL NUMERIC columns may come as strings, so we parse explicitly
    const total_expected_amount = regs.reduce((sum, reg) => {
      const price = Number(reg.price) || Number(event.default_price) || 0;
      const quantity = Number(reg.quantity) || 1;
      return sum + (price * quantity);
    }, 0);

    // Calculate paid amount (exclude refunded registrations)
    const total_paid_amount = regs.reduce((sum, reg) => {
      if (reg.payment_status === 'refunded') return sum;
      return sum + (Number(reg.paid_amount) || 0);
    }, 0);

    // Calculate refunded amount
    const total_refunded_amount = regs.reduce((sum, reg) => {
      if (reg.payment_status !== 'refunded') return sum;
      return sum + (Number(reg.paid_amount) || 0);
    }, 0);

    // Count by payment status
    const paid_count = regs.filter(r => r.payment_status === 'paid').length;
    const pending_count = regs.filter(r => r.payment_status === 'pending').length;
    const overdue_count = regs.filter(r => r.payment_status === 'overdue').length;
    const refunded_count = regs.filter(r => r.payment_status === 'refunded').length;

    // Payment completion percentage
    const payment_completion_percent = total_expected_amount > 0
      ? Math.round((total_paid_amount / total_expected_amount) * 100)
      : 0;

    // Breakdown by status
    const breakdown_by_status: Record<string, number> = {};
    regs.forEach(reg => {
      const status = reg.payment_status || 'pending';
      breakdown_by_status[status] = (breakdown_by_status[status] || 0) + 1;
    });

    const stats = {
      total_registrations,
      total_expected_amount,
      total_paid_amount,
      total_refunded_amount,
      paid_count,
      pending_count,
      overdue_count,
      refunded_count,
      payment_completion_percent,
      breakdown_by_status
    };

    logger.info({ 
      event_id: eventId,
      stats
    }, 'Payment stats calculated');

    return NextResponse.json({ stats });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in GET /api/events/[id]/payments/stats');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
