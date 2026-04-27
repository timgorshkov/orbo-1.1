/**
 * Superadmin: change the active acquiring gateway for a single organization.
 *
 * PATCH /api/superadmin/organizations/[id]/active-gateway
 * Body: { active_gateway: 'tbank' | 'cloudpayments' | null }
 *
 * NULL means "use platform default" (process.env.DEFAULT_GATEWAY or T-Bank).
 *
 * No public Settings UI yet — during the T-Bank → CloudPayments migration the
 * switch is a superadmin operation. UI for it will be added once we run more
 * than a single test org on CloudPayments.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const ALLOWED = ['tbank', 'cloudpayments'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/organizations/active-gateway' })

  try {
    if (!(await isSuperadmin())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await getUnifiedUser()
    const { id: orgId } = await params
    if (!orgId) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const value = body.active_gateway

    if (value !== null && !ALLOWED.includes(value)) {
      return NextResponse.json(
        { error: `active_gateway must be null or one of: ${ALLOWED.join(', ')}` },
        { status: 400 }
      )
    }

    const db = createAdminServer()
    const { data: org, error: fetchErr } = await db
      .from('organizations')
      .select('id, name, active_gateway')
      .eq('id', orgId)
      .single()

    if (fetchErr || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const before = (org as any).active_gateway
    const { error: updateErr } = await db
      .from('organizations')
      .update({ active_gateway: value })
      .eq('id', orgId)

    if (updateErr) {
      logger.error({ org_id: orgId, error: updateErr.message }, 'Failed to update active_gateway')
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    logger.info({
      org_id: orgId,
      org_name: (org as any).name,
      changed_by: user?.id,
      from: before,
      to: value,
    }, 'Active payment gateway changed')

    return NextResponse.json({ success: true, active_gateway: value })
  } catch (err: any) {
    logger.error({ error: err?.message }, 'active-gateway PATCH error')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
