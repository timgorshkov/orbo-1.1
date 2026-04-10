import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { requestWithdrawal, getWithdrawals } from '@/lib/services/withdrawalService'

export const dynamic = 'force-dynamic'

// GET /api/org-withdrawals?orgId=...&status=...&page=...&pageSize=...
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/org-withdrawals' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  const role = await getEffectiveOrgRole(user.id, orgId)
  if (!role || (role.role !== 'owner' && role.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const status = request.nextUrl.searchParams.get('status') || undefined
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(request.nextUrl.searchParams.get('pageSize') || '20'), 100)

    const result = await getWithdrawals({
      orgId,
      status: status as any,
      page,
      pageSize,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to list withdrawals')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/org-withdrawals — request a withdrawal
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/org-withdrawals' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { orgId, periodFrom, periodTo, bankAccountId, contractId, items } = body
  const amount = typeof body.amount === 'string' ? parseFloat(body.amount) : body.amount

  if (!orgId || !amount) {
    return NextResponse.json({ error: 'orgId and amount are required' }, { status: 400 })
  }

  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const role = await getEffectiveOrgRole(user.id, orgId)
  if (!role || role.role !== 'owner') {
    return NextResponse.json({ error: 'Only org owner can request withdrawals' }, { status: 403 })
  }

  try {
    const withdrawal = await requestWithdrawal({
      orgId,
      amount,
      periodFrom,
      periodTo,
      bankAccountId,
      contractId,
      requestedBy: user.id,
      items,
    })

    return NextResponse.json({ withdrawal }, { status: 201 })
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to request withdrawal')

    // Return user-facing errors with 400
    if (
      error.message.includes('Insufficient balance') ||
      error.message.includes('below minimum') ||
      error.message.includes('pending withdrawal') ||
      error.message.includes('Contract must be')
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
