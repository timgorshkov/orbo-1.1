import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { getTransactionHistory } from '@/lib/services/orgAccountService'
import type { TransactionType } from '@/lib/services/orgAccountService'

export const dynamic = 'force-dynamic'

// GET /api/org-account/transactions?orgId=...&type=...&eventId=...&participantId=...&dateFrom=...&dateTo=...&page=...&pageSize=...
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/org-account/transactions' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const orgId = searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  const role = await getEffectiveOrgRole(user.id, orgId)
  if (!role || (role.role !== 'owner' && role.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const typeParam = searchParams.get('type')
  const eventId = searchParams.get('eventId')
  const participantId = searchParams.get('participantId')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 100)

  try {
    const result = await getTransactionHistory(orgId, {
      type: typeParam as TransactionType | undefined,
      eventId: eventId || undefined,
      participantId: participantId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to get transactions')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
