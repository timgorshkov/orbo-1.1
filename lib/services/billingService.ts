import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('BillingService')

const PAYMENT_URL = 'https://payform.ru/tkaK5Rn/'
const TRIAL_DAYS = 14
const TRIAL_WARNING_DAYS = 3 // show payment nudge in last 3 days of trial

export interface BillingPlan {
  code: string
  name: string
  description: string | null
  price_monthly: number | null
  limits: {
    participants: number
    ai_requests_per_month: number
    custom_notification_rules: boolean
  }
  features: Record<string, boolean>
}

export interface OrgSubscription {
  id: string
  org_id: string
  plan_code: string
  status: string
  started_at: string
  expires_at: string | null
  auto_renew: boolean
  over_limit_since: string | null
  payment_url: string | null
  notes: string | null
}

export interface BillingStatus {
  plan: BillingPlan
  subscription: OrgSubscription | null
  participantCount: number
  participantLimit: number
  isOverLimit: boolean
  paymentUrl: string
  aiEnabled: boolean
  // Trial fields
  isTrial: boolean
  trialDaysRemaining: number
  trialExpired: boolean
  trialWarning: boolean // true when <=3 days left or trial expired
  // Legacy compat
  gracePeriodExpired: boolean
  daysOverLimit: number
}

export type BillingFeature = 'ai_analysis' | 'custom_rules'

// ----- Plan cache (static data, rarely changes) -----

let plansCache: BillingPlan[] | null = null
let plansCacheTime = 0
const PLANS_CACHE_TTL = 5 * 60 * 1000 // 5 min

export async function getPlans(): Promise<BillingPlan[]> {
  if (plansCache && Date.now() - plansCacheTime < PLANS_CACHE_TTL) return plansCache

  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    logger.error({ error: error?.message }, 'Failed to fetch billing plans')
    return getDefaultPlans()
  }

  plansCache = data.map(mapPlan)
  plansCacheTime = Date.now()
  return plansCache
}

export async function getPlanByCode(code: string): Promise<BillingPlan> {
  const plans = await getPlans()
  return plans.find(p => p.code === code) || getDefaultPlans()[0]
}

// ----- Subscription -----

export async function getOrgSubscription(orgId: string): Promise<OrgSubscription | null> {
  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('org_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch subscription')
    return null
  }
  return data
}

export async function ensureSubscription(orgId: string): Promise<OrgSubscription> {
  let sub = await getOrgSubscription(orgId)
  if (sub) return sub

  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('org_subscriptions')
    .upsert({ org_id: orgId, plan_code: 'free', status: 'active' }, { onConflict: 'org_id' })
    .select()
    .single()

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to create default subscription')
    return { id: '', org_id: orgId, plan_code: 'free', status: 'active', started_at: new Date().toISOString(), expires_at: null, auto_renew: false, over_limit_since: null, payment_url: null, notes: null }
  }
  return data
}

// ----- Participant count -----

export async function getOrgParticipantCount(orgId: string): Promise<number> {
  const supabase = createAdminServer()
  const { count, error } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .neq('source', 'bot')
    .neq('participant_status', 'excluded')
    .is('merged_into', null)

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to count participants')
    return 0
  }
  return count || 0
}

// ----- Auto-upgrade to trial -----

async function startProTrial(orgId: string): Promise<void> {
  const supabase = createAdminServer()
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS)

  const { error } = await supabase
    .from('org_subscriptions')
    .update({
      plan_code: 'pro',
      status: 'trial',
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      over_limit_since: null,
      notes: `Auto-trial started: participants exceeded free limit`,
    })
    .eq('org_id', orgId)

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to start Pro trial')
    return
  }

  logger.info({ org_id: orgId, expires_at: expiresAt.toISOString() }, 'Pro trial auto-started (14 days)')
}

// ----- Full billing status -----

export async function getOrgBillingStatus(orgId: string): Promise<BillingStatus> {
  const [subscription, participantCount, plans] = await Promise.all([
    ensureSubscription(orgId),
    getOrgParticipantCount(orgId),
    getPlans(),
  ])

  const freePlan = plans.find(p => p.code === 'free') || getDefaultPlans()[0]
  const freeLimit = freePlan.limits.participants

  // Auto-trial: free plan org with 1000+ participants → start Pro trial
  if (
    subscription.plan_code === 'free' &&
    subscription.status === 'active' &&
    freeLimit > 0 &&
    participantCount > freeLimit
  ) {
    await startProTrial(orgId)
    subscription.plan_code = 'pro'
    subscription.status = 'trial'
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS)
    subscription.expires_at = expiresAt.toISOString()
    subscription.over_limit_since = null
    subscription.notes = 'Auto-trial started: participants exceeded free limit'
  }

  const plan = plans.find(p => p.code === subscription.plan_code) || freePlan
  const participantLimit = plan.limits.participants

  // Trial calculations
  const isTrial = subscription.status === 'trial'
  let trialDaysRemaining = 0
  let trialExpired = false
  let trialWarning = false

  if (isTrial && subscription.expires_at) {
    const expiresMs = new Date(subscription.expires_at).getTime()
    const remainingMs = expiresMs - Date.now()
    trialDaysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
    trialExpired = remainingMs <= 0
    trialWarning = trialDaysRemaining <= TRIAL_WARNING_DAYS || trialExpired
  }

  // isOverLimit: only relevant for non-trial paid plans or expired trials
  const isOverLimit = isTrial ? trialExpired : (participantLimit > 0 && participantCount > participantLimit)

  // gracePeriodExpired: for backward compat — blocking when trial expired
  const gracePeriodExpired = isTrial ? trialExpired : false

  return {
    plan,
    subscription,
    participantCount,
    participantLimit: participantLimit === -1 ? Infinity : participantLimit,
    isOverLimit,
    paymentUrl: subscription.payment_url || PAYMENT_URL,
    aiEnabled: plan.limits.custom_notification_rules,
    isTrial,
    trialDaysRemaining,
    trialExpired,
    trialWarning,
    gracePeriodExpired,
    daysOverLimit: 0,
  }
}

// ----- Feature access -----

export async function checkFeatureAccess(
  orgId: string,
  feature: BillingFeature
): Promise<{ allowed: boolean; reason?: string; paymentUrl: string }> {
  const status = await getOrgBillingStatus(orgId)

  // During active trial, all Pro features are available
  if (status.isTrial && !status.trialExpired) {
    return { allowed: true, paymentUrl: status.paymentUrl }
  }

  switch (feature) {
    case 'ai_analysis':
    case 'custom_rules':
      if (!status.aiEnabled) {
        return { allowed: false, reason: 'AI-функции доступны на тарифе Профессиональный', paymentUrl: status.paymentUrl }
      }
      return { allowed: true, paymentUrl: status.paymentUrl }
    default:
      return { allowed: true, paymentUrl: status.paymentUrl }
  }
}

// ----- Invoices -----

export async function getOrgInvoices(orgId: string) {
  const supabase = createAdminServer()
  const { data, error } = await supabase
    .from('org_invoices')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to fetch invoices')
    return []
  }
  return data || []
}

// ----- Superadmin operations -----

export async function activatePro(orgId: string, months: number, confirmedBy: string, paymentMethod?: string): Promise<boolean> {
  const supabase = createAdminServer()
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + months)

  const sub = await ensureSubscription(orgId)

  const { error: subError } = await supabase
    .from('org_subscriptions')
    .update({
      plan_code: 'pro',
      status: 'active',
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      over_limit_since: null,
    })
    .eq('org_id', orgId)

  if (subError) {
    logger.error({ org_id: orgId, error: subError.message }, 'Failed to activate Pro')
    return false
  }

  const { error: invError } = await supabase
    .from('org_invoices')
    .insert({
      org_id: orgId,
      subscription_id: sub.id,
      amount: 1500 * months,
      currency: 'RUB',
      period_start: now.toISOString().slice(0, 10),
      period_end: expiresAt.toISOString().slice(0, 10),
      status: 'paid',
      payment_method: paymentMethod || 'manual',
      paid_at: now.toISOString(),
      confirmed_by: confirmedBy,
    })

  if (invError) {
    logger.error({ org_id: orgId, error: invError.message }, 'Failed to create invoice')
  }

  logger.info({ org_id: orgId, months, confirmed_by: confirmedBy }, 'Pro plan activated')
  return true
}

export async function cancelSubscription(orgId: string): Promise<boolean> {
  const supabase = createAdminServer()
  const { error } = await supabase
    .from('org_subscriptions')
    .update({ plan_code: 'free', status: 'active', expires_at: null, over_limit_since: null })
    .eq('org_id', orgId)

  if (error) {
    logger.error({ org_id: orgId, error: error.message }, 'Failed to cancel subscription')
    return false
  }
  logger.info({ org_id: orgId }, 'Subscription cancelled, reverted to free')
  return true
}

// ----- Helpers -----

function mapPlan(row: any): BillingPlan {
  return {
    code: row.code,
    name: row.name,
    description: row.description,
    price_monthly: row.price_monthly,
    limits: row.limits || { participants: 1000, ai_requests_per_month: 0, custom_notification_rules: false },
    features: row.features || {},
  }
}

function getDefaultPlans(): BillingPlan[] {
  return [
    { code: 'free', name: 'Бесплатный', description: 'Для небольших сообществ', price_monthly: 0, limits: { participants: 1000, ai_requests_per_month: 0, custom_notification_rules: false }, features: {} },
    { code: 'pro', name: 'Профессиональный', description: 'Без ограничений', price_monthly: 1500, limits: { participants: -1, ai_requests_per_month: -1, custom_notification_rules: true }, features: {} },
    { code: 'enterprise', name: 'Корпоративный', description: 'Индивидуальные условия', price_monthly: null, limits: { participants: -1, ai_requests_per_month: -1, custom_notification_rules: true }, features: {} },
  ]
}
