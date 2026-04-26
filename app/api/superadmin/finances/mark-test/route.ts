/**
 * POST /api/superadmin/finances/mark-test
 * Body: { paymentSessionId: string, isTest: boolean }
 *
 * Toggle the is_test flag on a payment_session. Used to retroactively exclude
 * acquirer test-terminal transactions from accounting reports.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { isSuperadmin } from '@/lib/server/superadminGuard';
import { createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/finances/mark-test' });

  if (!(await isSuperadmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { paymentSessionId, isTest } = await request.json();

    if (!paymentSessionId || typeof isTest !== 'boolean') {
      return NextResponse.json({ error: 'paymentSessionId (uuid) and isTest (bool) are required' }, { status: 400 });
    }

    const db = createAdminServer();
    const { error } = await db
      .from('payment_sessions')
      .update({ is_test: isTest })
      .eq('id', paymentSessionId);

    if (error) {
      logger.error({ error: error.message, paymentSessionId, isTest }, 'Failed to update is_test flag');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    logger.info({ paymentSessionId, isTest }, 'Payment session test flag updated');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err.message }, 'mark-test failed');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
