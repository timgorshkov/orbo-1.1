import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'

const logger = createServiceLogger('MembershipService')

// ─── Types ───────────────────────────────────────────────────────────

export interface MembershipPlan {
  id: string
  org_id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  billing_period: string
  custom_period_days: number | null
  payment_link: string | null
  payment_instructions: string | null
  trial_days: number
  grace_period_days: number
  is_active: boolean
  is_public: boolean
  max_members: number | null
  sort_order: number
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

export interface MembershipPlanAccess {
  id: string
  plan_id: string
  resource_type: 'telegram_group' | 'telegram_channel' | 'max_group' | 'materials' | 'events' | 'member_directory'
  resource_id: string | null
  created_at: string
}

export type MembershipStatus = 'pending' | 'trial' | 'active' | 'expired' | 'cancelled' | 'suspended'
export type MembershipBasis = 'payment' | 'invitation' | 'moderation' | 'manual' | 'import' | 'promotion'

export interface ParticipantMembership {
  id: string
  org_id: string
  participant_id: string
  plan_id: string
  status: MembershipStatus
  basis: MembershipBasis
  started_at: string | null
  expires_at: string | null
  cancelled_at: string | null
  last_payment_id: string | null
  next_billing_date: string | null
  amount_paid: number | null
  access_synced_at: string | null
  access_sync_status: string
  granted_by: string | null
  notes: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface MembershipPayment {
  id: string
  membership_id: string
  org_id: string
  amount: number
  currency: string
  payment_method: string | null
  status: 'pending' | 'confirmed' | 'failed' | 'refunded'
  paid_at: string | null
  confirmed_by: string | null
  notes: string | null
  receipt_url: string | null
  created_at: string
}

// ─── Plan Management ─────────────────────────────────────────────────

export async function getOrgPlans(orgId: string): Promise<MembershipPlan[]> {
  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch membership plans')
    return []
  }
  return data || []
}

export async function getActivePlans(orgId: string): Promise<MembershipPlan[]> {
  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch active membership plans')
    return []
  }
  return data || []
}

export async function getPlanById(planId: string): Promise<MembershipPlan | null> {
  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (error) {
    logger.error({ plan_id: planId, error: error.message }, 'Failed to fetch plan')
    return null
  }
  return data
}

export async function createPlan(
  orgId: string,
  plan: Partial<MembershipPlan>,
  userId: string
): Promise<MembershipPlan | null> {
  const supabase = createAdminServer()

  const { data, error } = await supabase
    .from('membership_plans')
    .insert({
      org_id: orgId,
      name: plan.name || 'Членство',
      description: plan.description || null,
      price: plan.price ?? null,
      currency: plan.currency || 'RUB',
      billing_period: plan.billing_period || 'monthly',
      custom_period_days: plan.custom_period_days || null,
      payment_link: plan.payment_link || null,
      payment_instructions: plan.payment_instructions || null,
      trial_days: plan.trial_days ?? 0,
      grace_period_days: plan.grace_period_days ?? 3,
      is_active: plan.is_active ?? true,
      is_public: plan.is_public ?? true,
      max_members: plan.max_members ?? null,
      sort_order: plan.sort_order ?? 0,
      settings: plan.settings || {},
    })
    .select()
    .single()

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to create membership plan')
    return null
  }

  await logAdminAction({
    orgId,
    userId,
    action: AdminActions.CREATE_SUBSCRIPTION,
    resourceType: ResourceTypes.SUBSCRIPTION,
    resourceId: data.id,
    metadata: { plan_name: data.name, price: data.price, billing_period: data.billing_period },
  })

  logger.info({ org_id: orgId, plan_id: data.id, plan_name: data.name }, 'Membership plan created')
  return data
}

export async function updatePlan(
  planId: string,
  updates: Partial<MembershipPlan>,
  userId: string,
  orgId: string
): Promise<MembershipPlan | null> {
  const supabase = createAdminServer()

  const allowedFields: Record<string, any> = {}
  const editableKeys: (keyof MembershipPlan)[] = [
    'name', 'description', 'price', 'currency', 'billing_period',
    'custom_period_days', 'payment_link', 'payment_instructions',
    'trial_days', 'grace_period_days', 'is_active', 'is_public',
    'max_members', 'sort_order', 'settings',
  ]
  for (const key of editableKeys) {
    if (updates[key] !== undefined) allowedFields[key] = updates[key]
  }
  allowedFields.updated_at = new Date().toISOString()

  if (Object.keys(allowedFields).length <= 1) return null

  const { data, error } = await supabase
    .from('membership_plans')
    .update(allowedFields)
    .eq('id', planId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    logger.error({ plan_id: planId, error: error.message }, 'Failed to update membership plan')
    return null
  }

  await logAdminAction({
    orgId,
    userId,
    action: AdminActions.UPDATE_SUBSCRIPTION,
    resourceType: ResourceTypes.SUBSCRIPTION,
    resourceId: planId,
    metadata: { updated_fields: Object.keys(allowedFields) },
  })

  return data
}

export async function deletePlan(planId: string, orgId: string, userId: string): Promise<boolean> {
  const supabase = createAdminServer()

  // Check for active memberships first
  const { count } = await supabase
    .from('participant_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .in('status', ['active', 'trial', 'pending'])

  if (count && count > 0) {
    logger.warn({ plan_id: planId, active_count: count }, 'Cannot delete plan with active memberships')
    return false
  }

  const { error } = await supabase
    .from('membership_plans')
    .delete()
    .eq('id', planId)
    .eq('org_id', orgId)

  if (error) {
    logger.error({ plan_id: planId, error: error.message }, 'Failed to delete membership plan')
    return false
  }

  await logAdminAction({
    orgId,
    userId,
    action: AdminActions.CANCEL_SUBSCRIPTION,
    resourceType: ResourceTypes.SUBSCRIPTION,
    resourceId: planId,
  })

  return true
}

// ─── Access Rules ────────────────────────────────────────────────────

export async function getPlanAccessRules(planId: string): Promise<MembershipPlanAccess[]> {
  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('membership_plan_access')
    .select('*')
    .eq('plan_id', planId)

  if (error) {
    logger.error({ plan_id: planId, error: error.message }, 'Failed to fetch plan access rules')
    return []
  }
  return data || []
}

export async function setPlanAccessRules(
  planId: string,
  rules: Array<{ resource_type: string; resource_id: string | null }>
): Promise<boolean> {
  const supabase = createAdminServer()

  const { error: delErr } = await supabase
    .from('membership_plan_access')
    .delete()
    .eq('plan_id', planId)

  if (delErr) {
    logger.error({ plan_id: planId, error: delErr.message }, 'Failed to clear access rules')
    return false
  }

  if (rules.length === 0) return true

  const rows = rules.map(r => ({
    plan_id: planId,
    resource_type: r.resource_type,
    resource_id: r.resource_id,
  }))

  const { error: insErr } = await supabase
    .from('membership_plan_access')
    .insert(rows)

  if (insErr) {
    logger.error({ plan_id: planId, error: insErr.message }, 'Failed to insert access rules')
    return false
  }

  return true
}

// ─── Membership Lifecycle ────────────────────────────────────────────

export async function grantMembership(params: {
  orgId: string
  participantId: string
  planId: string
  basis: MembershipBasis
  grantedBy: string
  startsAt?: string
  expiresAt?: string | null
  notes?: string
}): Promise<ParticipantMembership | null> {
  const supabase = createAdminServer()

  const plan = await getPlanById(params.planId)
  if (!plan) {
    logger.error({ plan_id: params.planId }, 'Plan not found for membership grant')
    return null
  }

  const now = new Date()
  const startsAt = params.startsAt || now.toISOString()
  let expiresAt = params.expiresAt

  if (expiresAt === undefined && plan.billing_period !== 'one_time') {
    expiresAt = calculateExpiryDate(startsAt, plan.billing_period, plan.custom_period_days)
  }

  let status: MembershipStatus = 'active'
  if (plan.trial_days > 0 && params.basis === 'payment') {
    const trialEnd = new Date(startsAt)
    trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
    expiresAt = trialEnd.toISOString()
    status = 'trial'
  }

  // Check if membership already exists — if so, reactivate
  const { data: existing } = await supabase
    .from('participant_memberships')
    .select('id, status')
    .eq('org_id', params.orgId)
    .eq('participant_id', params.participantId)
    .eq('plan_id', params.planId)
    .single()

  if (existing) {
    const { data: updated, error } = await supabase
      .from('participant_memberships')
      .update({
        status,
        basis: params.basis,
        started_at: startsAt,
        expires_at: expiresAt,
        cancelled_at: null,
        granted_by: params.grantedBy,
        notes: params.notes || null,
        access_sync_status: 'pending',
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      logger.error({ membership_id: existing.id, error: error.message }, 'Failed to reactivate membership')
      return null
    }

    logger.info({
      org_id: params.orgId,
      participant_id: params.participantId,
      membership_id: existing.id,
      status,
    }, 'Membership reactivated')

    await logAdminAction({
      orgId: params.orgId,
      userId: params.grantedBy,
      action: AdminActions.UPDATE_SUBSCRIPTION,
      resourceType: ResourceTypes.SUBSCRIPTION,
      resourceId: existing.id,
      metadata: { action: 'reactivate', basis: params.basis, status },
    })

    return updated
  }

  // Create new membership
  const { data, error } = await supabase
    .from('participant_memberships')
    .insert({
      org_id: params.orgId,
      participant_id: params.participantId,
      plan_id: params.planId,
      status,
      basis: params.basis,
      started_at: startsAt,
      expires_at: expiresAt,
      granted_by: params.grantedBy,
      notes: params.notes || null,
      access_sync_status: 'pending',
    })
    .select()
    .single()

  if (error) {
    logger.error({ org_id: params.orgId, participant_id: params.participantId, error: error.message }, 'Failed to grant membership')
    return null
  }

  await logAdminAction({
    orgId: params.orgId,
    userId: params.grantedBy,
    action: AdminActions.CREATE_SUBSCRIPTION,
    resourceType: ResourceTypes.SUBSCRIPTION,
    resourceId: data.id,
    metadata: { plan_name: plan.name, basis: params.basis, status },
  })

  logger.info({
    org_id: params.orgId,
    participant_id: params.participantId,
    membership_id: data.id,
    plan_name: plan.name,
    status,
    basis: params.basis,
  }, 'Membership granted')

  return data
}

export async function revokeMembership(
  membershipId: string,
  userId: string,
  reason?: string
): Promise<boolean> {
  const supabase = createAdminServer()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('participant_memberships')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      notes: reason || null,
      access_sync_status: 'pending',
      updated_at: now,
    })
    .eq('id', membershipId)
    .select('org_id, participant_id')
    .single()

  if (error) {
    logger.error({ membership_id: membershipId, error: error.message }, 'Failed to revoke membership')
    return false
  }

  await logAdminAction({
    orgId: data.org_id,
    userId,
    action: AdminActions.CANCEL_SUBSCRIPTION,
    resourceType: ResourceTypes.SUBSCRIPTION,
    resourceId: membershipId,
    metadata: { reason },
  })

  logger.info({ membership_id: membershipId, participant_id: data.participant_id }, 'Membership revoked')
  return true
}

export async function extendMembership(
  membershipId: string,
  newExpiresAt: string,
  userId: string
): Promise<boolean> {
  const supabase = createAdminServer()

  const { data, error } = await supabase
    .from('participant_memberships')
    .update({
      expires_at: newExpiresAt,
      status: 'active',
      access_sync_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', membershipId)
    .select('org_id')
    .single()

  if (error) {
    logger.error({ membership_id: membershipId, error: error.message }, 'Failed to extend membership')
    return false
  }

  await logAdminAction({
    orgId: data.org_id,
    userId,
    action: AdminActions.UPDATE_SUBSCRIPTION,
    resourceType: ResourceTypes.SUBSCRIPTION,
    resourceId: membershipId,
    metadata: { new_expires_at: newExpiresAt },
  })

  return true
}

// ─── Querying ────────────────────────────────────────────────────────

export async function getParticipantMembership(
  orgId: string,
  participantId: string
): Promise<(ParticipantMembership & { plan?: MembershipPlan }) | null> {
  const supabase = createAdminServer()

  const { data, error } = await supabase
    .from('participant_memberships')
    .select('*, plan:membership_plans(*)')
    .eq('org_id', orgId)
    .eq('participant_id', participantId)
    .in('status', ['active', 'trial', 'pending', 'suspended'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error({ org_id: orgId, participant_id: participantId, error: error.message }, 'Failed to fetch participant membership')
    return null
  }
  return data
}

export async function getOrgMemberships(
  orgId: string,
  options?: { status?: MembershipStatus[]; limit?: number; offset?: number }
): Promise<{ memberships: ParticipantMembership[]; total: number }> {
  const supabase = createAdminServer()

  let query = supabase
    .from('participant_memberships')
    .select('*, plan:membership_plans(id, name, price, billing_period), participant:participants(id, full_name, username, photo_url)', { count: 'exact' })
    .eq('org_id', orgId)

  if (options?.status && options.status.length > 0) {
    query = query.in('status', options.status)
  }

  query = query.order('created_at', { ascending: false })

  if (options?.limit) query = query.limit(options.limit)
  if (options?.offset) query = query.range(options.offset, options.offset + (options?.limit || 50) - 1)

  const { data, error, count } = await query

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch org memberships')
    return { memberships: [], total: 0 }
  }

  return { memberships: data || [], total: count || 0 }
}

export async function getOrgMembershipMap(orgId: string): Promise<Map<string, MembershipStatus>> {
  const supabase = createAdminServer()

  const { data, error } = await supabase
    .from('participant_memberships')
    .select('participant_id, status')
    .eq('org_id', orgId)
    .in('status', ['active', 'trial', 'pending', 'suspended', 'expired'])

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch membership map')
    return new Map()
  }

  const map = new Map<string, MembershipStatus>()
  for (const row of data || []) {
    const existing = map.get(row.participant_id)
    // Active/trial takes precedence over expired/pending
    if (!existing || statusPriority(row.status) > statusPriority(existing)) {
      map.set(row.participant_id, row.status as MembershipStatus)
    }
  }
  return map
}

function statusPriority(status: string): number {
  const priorities: Record<string, number> = { active: 5, trial: 4, pending: 3, suspended: 2, expired: 1, cancelled: 0 }
  return priorities[status] ?? 0
}

// ─── Access Checks ───────────────────────────────────────────────────

export async function orgHasMembershipPlans(orgId: string): Promise<boolean> {
  const supabase = createAdminServer()
  const { count, error } = await supabase
    .from('membership_plans')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (error) return false
  return (count || 0) > 0
}

export async function isResourceGated(
  orgId: string,
  resourceType: string,
  resourceId?: string
): Promise<boolean> {
  const supabase = createAdminServer()

  let query = supabase
    .from('membership_plan_access')
    .select('id, plan:membership_plans!inner(org_id, is_active)', { count: 'exact', head: true })
    .eq('resource_type', resourceType)
    .eq('plan.org_id', orgId)
    .eq('plan.is_active', true)

  if (resourceId) {
    query = query.eq('resource_id', resourceId)
  } else {
    query = query.is('resource_id', null)
  }

  const { count, error } = await query

  if (error) {
    logger.debug({ org_id: orgId, resource_type: resourceType, error: error.message }, 'isResourceGated check failed')
    return false
  }
  return (count || 0) > 0
}

export async function hasActiveAccess(
  orgId: string,
  participantId: string,
  resourceType?: string,
  resourceId?: string
): Promise<boolean> {
  const membership = await getParticipantMembership(orgId, participantId)
  if (!membership) return false
  if (membership.status !== 'active' && membership.status !== 'trial') return false

  if (!resourceType) return true

  const rules = await getPlanAccessRules(membership.plan_id)
  return rules.some(r =>
    r.resource_type === resourceType &&
    (r.resource_id === null || r.resource_id === resourceId)
  )
}

// ─── Payments ────────────────────────────────────────────────────────

export async function recordPayment(params: {
  membershipId: string
  orgId: string
  amount: number
  currency?: string
  paymentMethod?: string
  status?: 'pending' | 'confirmed'
  paidAt?: string
  confirmedBy?: string
  notes?: string
}): Promise<MembershipPayment | null> {
  const supabase = createAdminServer()

  const { data, error } = await supabase
    .from('membership_payments')
    .insert({
      membership_id: params.membershipId,
      org_id: params.orgId,
      amount: params.amount,
      currency: params.currency || 'RUB',
      payment_method: params.paymentMethod || null,
      status: params.status || 'pending',
      paid_at: params.paidAt || null,
      confirmed_by: params.confirmedBy || null,
      notes: params.notes || null,
    })
    .select()
    .single()

  if (error) {
    logger.error({ membership_id: params.membershipId, error: error.message }, 'Failed to record payment')
    return null
  }

  if (params.status === 'confirmed') {
    await supabase
      .from('participant_memberships')
      .update({
        last_payment_id: data.id,
        amount_paid: params.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.membershipId)
  }

  return data
}

export async function confirmPayment(
  paymentId: string,
  confirmedBy: string
): Promise<boolean> {
  const supabase = createAdminServer()

  const { data, error } = await supabase
    .from('membership_payments')
    .update({
      status: 'confirmed',
      paid_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
    })
    .eq('id', paymentId)
    .select('membership_id, amount, org_id')
    .single()

  if (error) {
    logger.error({ payment_id: paymentId, error: error.message }, 'Failed to confirm payment')
    return false
  }

  await supabase
    .from('participant_memberships')
    .update({
      last_payment_id: paymentId,
      amount_paid: data.amount,
      status: 'active',
      access_sync_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.membership_id)

  return true
}

export async function getMembershipPayments(membershipId: string): Promise<MembershipPayment[]> {
  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('membership_id', membershipId)
    .order('created_at', { ascending: false })

  if (error) return []
  return data || []
}

// ─── Expiration ──────────────────────────────────────────────────────

export async function expireOverdueMemberships(): Promise<number> {
  const supabase = createAdminServer()
  const now = new Date()

  const { data: expirable, error } = await supabase
    .from('participant_memberships')
    .select('id, org_id, participant_id, plan_id, expires_at, plan:membership_plans(grace_period_days)')
    .in('status', ['active', 'trial'])
    .not('expires_at', 'is', null)
    .lt('expires_at', now.toISOString())

  if (error || !expirable) {
    logger.error({ error: error?.message }, 'Failed to query expirable memberships')
    return 0
  }

  let expired = 0
  for (const m of expirable) {
    const graceDays = (m.plan as any)?.grace_period_days ?? 3
    const deadline = new Date(m.expires_at!)
    deadline.setDate(deadline.getDate() + graceDays)

    if (now >= deadline) {
      const { error: upErr } = await supabase
        .from('participant_memberships')
        .update({ status: 'expired', access_sync_status: 'pending', updated_at: now.toISOString() })
        .eq('id', m.id)

      if (!upErr) {
        expired++
        logger.info({ membership_id: m.id, participant_id: m.participant_id, org_id: m.org_id }, 'Membership expired')
      }
    }
  }

  if (expired > 0) {
    logger.info({ expired_count: expired }, 'Expired overdue memberships')
  }
  return expired
}

// ─── Helpers ─────────────────────────────────────────────────────────

function calculateExpiryDate(startDate: string, period: string, customDays?: number | null): string {
  const d = new Date(startDate)
  switch (period) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'semi_annual': d.setMonth(d.getMonth() + 6); break
    case 'annual': d.setFullYear(d.getFullYear() + 1); break
    case 'custom': d.setDate(d.getDate() + (customDays || 30)); break
    default: break
  }
  return d.toISOString()
}
