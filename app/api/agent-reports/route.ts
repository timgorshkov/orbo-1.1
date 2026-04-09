import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { getReportsByOrg } from '@/lib/services/agentReportService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agent-reports?orgId=...
 * Список отчётов агента для организации.
 */
export async function GET(request: NextRequest) {
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

  const reports = await getReportsByOrg(orgId)
  return NextResponse.json({ reports })
}
