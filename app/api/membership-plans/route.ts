import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { checkFeatureAccess } from '@/lib/services/billingService'
import {
  getOrgPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanAccessRules,
  setPlanAccessRules,
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
  const logger = createAPILogger(req, { endpoint: 'membership-plans' })
  try {
    const url = new URL(req.url)
    const orgId = url.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const plans = await getOrgPlans(orgId)

    const plansWithAccess = await Promise.all(
      plans.map(async (plan) => ({
        ...plan,
        access_rules: await getPlanAccessRules(plan.id),
      }))
    )

    return NextResponse.json({ plans: plansWithAccess })
  } catch (err) {
    logger.error({ error: err }, 'Error fetching membership plans')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'membership-plans' })
  try {
    const body = await req.json()
    const { orgId, accessRules, ...planData } = body
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

    const auth = await checkOrgAdmin(orgId)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const plan = await createPlan(orgId, planData, auth.user!.id)
    if (!plan) return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })

    if (accessRules && Array.isArray(accessRules)) {
      await setPlanAccessRules(plan.id, accessRules)
    }

    const rules = await getPlanAccessRules(plan.id)
    return NextResponse.json({ plan: { ...plan, access_rules: rules } }, { status: 201 })
  } catch (err) {
    logger.error({ error: err }, 'Error creating membership plan')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'membership-plans' })
  try {
    const body = await req.json()
    const { id, orgId, accessRules, ...updates } = body
    if (!id || !orgId) return NextResponse.json({ error: 'id and orgId required' }, { status: 400 })

    const auth = await checkOrgAdmin(orgId)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const plan = await updatePlan(id, updates, auth.user!.id, orgId)

    if (accessRules && Array.isArray(accessRules)) {
      await setPlanAccessRules(id, accessRules)
    }

    const rules = await getPlanAccessRules(id)
    return NextResponse.json({ plan: plan ? { ...plan, access_rules: rules } : null })
  } catch (err) {
    logger.error({ error: err }, 'Error updating membership plan')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'membership-plans' })
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const orgId = url.searchParams.get('orgId')
    if (!id || !orgId) return NextResponse.json({ error: 'id and orgId required' }, { status: 400 })

    const auth = await checkOrgAdmin(orgId)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const ok = await deletePlan(id, orgId, auth.user!.id)
    if (!ok) return NextResponse.json({ error: 'Cannot delete plan with active memberships' }, { status: 409 })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ error: err }, 'Error deleting membership plan')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
