import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { checkFeatureAccess } from '@/lib/services/billingService'
import {
  grantMembership,
  revokeMembership,
  extendMembership,
  getOrgMemberships,
  getParticipantMembership,
  getOrgMembershipMap,
  type MembershipBasis,
} from '@/lib/services/membershipService'

export const dynamic = 'force-dynamic'

async function checkOrgAdmin(orgId: string) {
  const user = await getUnifiedUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null }

  const supabase = createAdminServer()
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'Forbidden', status: 403, user: null }
  }

  const access = await checkFeatureAccess(orgId, 'paid_membership')
  if (!access.allowed) {
    return { error: access.reason || 'Требуется тариф Клубный', status: 403, user: null }
  }

  return { error: null, status: 200, user }
}

export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'participant-memberships' })
  try {
    const url = new URL(req.url)
    const orgId = url.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const participantId = url.searchParams.get('participantId')
    const mapMode = url.searchParams.get('map')

    if (mapMode === 'true') {
      const map = await getOrgMembershipMap(orgId)
      return NextResponse.json({ membershipMap: Object.fromEntries(map) })
    }

    if (participantId) {
      const membership = await getParticipantMembership(orgId, participantId)
      return NextResponse.json({ membership })
    }

    const status = url.searchParams.get('status')?.split(',') || undefined
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const result = await getOrgMemberships(orgId, { status: status as any, limit, offset })
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ error: err }, 'Error fetching memberships')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'participant-memberships' })
  try {
    const body = await req.json()
    const { orgId, participantId, planId, basis, expiresAt, notes } = body
    if (!orgId || !participantId || !planId) {
      return NextResponse.json({ error: 'orgId, participantId, planId required' }, { status: 400 })
    }

    const auth = await checkOrgAdmin(orgId)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const membership = await grantMembership({
      orgId,
      participantId,
      planId,
      basis: (basis as MembershipBasis) || 'manual',
      grantedBy: auth.user!.id,
      expiresAt: expiresAt || undefined,
      notes,
    })

    if (!membership) return NextResponse.json({ error: 'Failed to grant membership' }, { status: 500 })

    return NextResponse.json({ membership }, { status: 201 })
  } catch (err) {
    logger.error({ error: err }, 'Error granting membership')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'participant-memberships' })
  try {
    const body = await req.json()
    const { id, orgId, action, expiresAt, reason } = body
    if (!id || !orgId || !action) {
      return NextResponse.json({ error: 'id, orgId, action required' }, { status: 400 })
    }

    const auth = await checkOrgAdmin(orgId)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    switch (action) {
      case 'revoke': {
        const ok = await revokeMembership(id, auth.user!.id, reason)
        if (!ok) return NextResponse.json({ error: 'Failed to revoke' }, { status: 500 })
        return NextResponse.json({ success: true })
      }
      case 'extend': {
        if (!expiresAt) return NextResponse.json({ error: 'expiresAt required for extend' }, { status: 400 })
        const ok = await extendMembership(id, expiresAt, auth.user!.id)
        if (!ok) return NextResponse.json({ error: 'Failed to extend' }, { status: 500 })
        return NextResponse.json({ success: true })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    logger.error({ error: err }, 'Error updating membership')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
