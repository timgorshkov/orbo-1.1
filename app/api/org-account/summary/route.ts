import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { getOrgFinancialSummary } from '@/lib/services/orgAccountService'

export const dynamic = 'force-dynamic'

// GET /api/org-account/summary?orgId=...&dateFrom=...&dateTo=...
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/org-account/summary' })

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

  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined

  try {
    const summary = await getOrgFinancialSummary(orgId, dateFrom, dateTo)
    return NextResponse.json(summary)
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to get financial summary')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
