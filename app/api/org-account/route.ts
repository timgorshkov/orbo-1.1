import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { createAPILogger } from '@/lib/logger'
import {
  getOrCreateOrgAccount,
  getOrgBalance,
  updateOrgAccount,
} from '@/lib/services/orgAccountService'

export const dynamic = 'force-dynamic'

// GET /api/org-account?orgId=... — get account info + balance
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/org-account' })

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
    const account = await getOrCreateOrgAccount(orgId)
    const balance = await getOrgBalance(orgId)

    return NextResponse.json({ account, balance })
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to get org account')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/org-account?orgId=... — update account settings (superadmin only)
export async function PATCH(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/org-account' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await isSuperadmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden — superadmin only' }, { status: 403 })
  }

  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  const body = await request.json()
  const { commission_rate, min_withdrawal_amount, is_active } = body

  // Validate commission_rate
  if (commission_rate !== undefined) {
    if (typeof commission_rate !== 'number' || commission_rate < 0 || commission_rate > 1) {
      return NextResponse.json({ error: 'commission_rate must be between 0 and 1' }, { status: 400 })
    }
  }

  try {
    // Ensure account exists before updating
    await getOrCreateOrgAccount(orgId)
    const account = await updateOrgAccount(orgId, { commission_rate, min_withdrawal_amount, is_active })

    logger.info({ org_id: orgId, updates: body }, 'Org account updated by superadmin')
    return NextResponse.json({ account })
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to update org account')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
