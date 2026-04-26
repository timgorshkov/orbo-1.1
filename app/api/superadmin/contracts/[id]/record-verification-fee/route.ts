/**
 * POST /api/superadmin/contracts/[id]/record-verification-fee
 * Body: { paidDate: string (YYYY-MM-DD), amount?: number, paymentNumber?: string }
 *
 * Manual booking of the verification fee for cases where:
 *   - Payment was made before this flow existed (retroactive bookkeeping)
 *   - Verification by bank statement is not feasible (e.g. statement file lost)
 *
 * Creates the org_invoice + АЛ act + auto-sync to Elba (idempotent — second
 * call returns the existing invoice).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { recordVerificationFeePayment } from '@/lib/services/contractVerificationFee'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/contracts/[id]/record-verification-fee' })

  if (!(await isSuperadmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const user = await getUnifiedUser()
    const body = await request.json()
    const { paidDate, amount, paymentNumber } = body || {}

    if (!paidDate || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
      return NextResponse.json({ error: 'paidDate (YYYY-MM-DD) обязателен' }, { status: 400 })
    }

    const result = await recordVerificationFeePayment({
      contractId: id,
      paidDate,
      amount: typeof amount === 'number' ? amount : undefined,
      paymentNumber: paymentNumber || null,
      confirmedBy: user?.id || 'superadmin',
    })

    logger.info({ contract_id: id, ...result }, 'Verification fee recorded manually')
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    logger.error({ error: err.message }, 'record-verification-fee failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
