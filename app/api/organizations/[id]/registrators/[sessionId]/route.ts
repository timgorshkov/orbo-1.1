/**
 * API: Revoke individual registrator session
 * DELETE /api/organizations/[id]/registrators/[sessionId]
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: orgId, sessionId } = await params
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/registrators/[sessionId]' })
  try {
    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = createAdminServer()
    await db
      .from('registrator_sessions')
      .update({ is_active: false })
      .eq('id', sessionId)
      .eq('org_id', orgId)

    logger.info({ org_id: orgId, session_id: sessionId }, 'Registrator session revoked')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error revoking registrator')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
