import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { getWithdrawalById, generateWithdrawalAct } from '@/lib/services/withdrawalService'

export const dynamic = 'force-dynamic'

// GET /api/org-withdrawals/[id] — get withdrawal details with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/org-withdrawals/[id]' })
  const { id } = await params

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const withdrawal = await getWithdrawalById(id)
    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
    }

    // Check access
    const role = await getEffectiveOrgRole(user.id, withdrawal.org_id)
    if (!role || (role.role !== 'owner' && role.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ withdrawal })
  } catch (error: any) {
    logger.error({ error: error.message, withdrawal_id: id }, 'Failed to get withdrawal')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/org-withdrawals/[id]?action=generate-act — generate act document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/org-withdrawals/[id]' })
  const { id } = await params

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const action = request.nextUrl.searchParams.get('action')
  if (action !== 'generate-act') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  try {
    const withdrawal = await getWithdrawalById(id)
    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
    }

    // Check access — owner or admin
    const role = await getEffectiveOrgRole(user.id, withdrawal.org_id)
    if (!role || (role.role !== 'owner' && role.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = await generateWithdrawalAct(id)
    return NextResponse.json({ url })
  } catch (error: any) {
    logger.error({ error: error.message, withdrawal_id: id }, 'Failed to generate act')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
