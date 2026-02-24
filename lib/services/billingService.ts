import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('BillingService')

const PAYMENT_URL = 'https://payform.ru/tkaK5Rn/'
const PRO_MONTHLY_PRICE = 1500
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

/**
 * Add a payment to an org subscription. If already on Pro, extends the existing period.
 * Duration is calculated from amount: amount / PRO_MONTHLY_PRICE = months.
 */
export async function addPayment(
  orgId: string,
  amount: number,
  confirmedBy: string,
  paymentMethod?: string
): Promise<{ success: boolean; periodStart: string; periodEnd: string } | { success: false }> {
  const supabase = createAdminServer()
  const sub = await ensureSubscription(orgId)

  const daysToAdd = Math.round((amount / PRO_MONTHLY_PRICE) * 30)
  if (daysToAdd < 1) {
    logger.warn({ org_id: orgId, amount }, 'Payment amount too small')
    return { success: false }
  }

  const now = new Date()
  let periodStart: Date
  let newExpiresAt: Date

  if (
    sub.plan_code === 'pro' &&
    (sub.status === 'active' || sub.status === 'trial') &&
    sub.expires_at &&
    new Date(sub.expires_at) > now
  ) {
    periodStart = new Date(sub.expires_at)
    newExpiresAt = new Date(periodStart)
    newExpiresAt.setDate(newExpiresAt.getDate() + daysToAdd)
  } else {
    periodStart = now
    newExpiresAt = new Date(now)
    newExpiresAt.setDate(newExpiresAt.getDate() + daysToAdd)
  }

  const { error: subError } = await supabase
    .from('org_subscriptions')
    .update({
      plan_code: 'pro',
      status: 'active',
      started_at: sub.plan_code !== 'pro' || sub.status !== 'active' ? now.toISOString() : sub.started_at,
      expires_at: newExpiresAt.toISOString(),
      over_limit_since: null,
    })
    .eq('org_id', orgId)

  if (subError) {
    logger.error({ org_id: orgId, error: subError.message }, 'Failed to update subscription for payment')
    return { success: false }
  }

  const { error: invError } = await supabase
    .from('org_invoices')
    .insert({
      org_id: orgId,
      subscription_id: sub.id,
      amount,
      currency: 'RUB',
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: newExpiresAt.toISOString().slice(0, 10),
      status: 'paid',
      payment_method: paymentMethod || 'manual',
      paid_at: now.toISOString(),
      confirmed_by: confirmedBy,
    })

  if (invError) {
    logger.error({ org_id: orgId, error: invError.message }, 'Failed to create invoice')
  }

  logger.info({ org_id: orgId, amount, days: daysToAdd, confirmed_by: confirmedBy, period_end: newExpiresAt.toISOString() }, 'Payment added')
  return { success: true, periodStart: periodStart.toISOString(), periodEnd: newExpiresAt.toISOString() }
}

/** @deprecated Use addPayment instead. Kept for backward compat. */
export async function activatePro(orgId: string, months: number, confirmedBy: string, paymentMethod?: string): Promise<boolean> {
  const result = await addPayment(orgId, PRO_MONTHLY_PRICE * months, confirmedBy, paymentMethod)
  return result.success
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

// ----- Payment period calculation (client-side helper) -----

export function calculatePaymentPeriod(currentExpiresAt: string | null): {
  periodStart: string
  periodEnd: string
  amount: number
  priceMonthly: number
} {
  const now = new Date()
  const start = currentExpiresAt && new Date(currentExpiresAt) > now
    ? new Date(currentExpiresAt)
    : now
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    amount: PRO_MONTHLY_PRICE,
    priceMonthly: PRO_MONTHLY_PRICE,
  }
}

// ----- Billing expiry notifications -----

export async function processExpiringSubscriptions(): Promise<{
  checked: number
  notified: number
  errors: number
}> {
  const supabase = createAdminServer()
  const stats = { checked: 0, notified: 0, errors: 0 }

  const now = new Date()
  const warningDate = new Date(now)
  warningDate.setDate(warningDate.getDate() + 7)

  const { data: expiringSubs, error } = await supabase
    .from('org_subscriptions')
    .select('*')
    .eq('plan_code', 'pro')
    .in('status', ['active', 'trial'])
    .not('expires_at', 'is', null)
    .lte('expires_at', warningDate.toISOString())

  if (error || !expiringSubs) {
    logger.error({ error: error?.message }, 'Failed to fetch expiring subscriptions')
    return stats
  }

  stats.checked = expiringSubs.length

  for (const sub of expiringSubs) {
    try {
      const expiresAt = new Date(sub.expires_at!)
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

      const shouldNotify = daysLeft <= 0 || daysLeft === 1 || daysLeft === 3 || daysLeft === 7

      if (!shouldNotify) continue

      const dedupKey = `billing_expiry_${sub.org_id}_${daysLeft <= 0 ? 'expired' : `d${daysLeft}`}`
      const { data: existing } = await supabase
        .from('notification_logs')
        .select('id')
        .eq('dedup_hash', dedupKey)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { data: org } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', sub.org_id)
        .single()

      if (!org) continue

      const { data: ownerMembership } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('org_id', sub.org_id)
        .eq('role', 'owner')
        .limit(1)
        .single()

      if (!ownerMembership) continue

      const { data: user } = await supabase
        .from('users')
        .select('id, email, name, tg_user_id')
        .eq('id', ownerMembership.user_id)
        .single()

      if (!user) continue

      let tgUserId = user.tg_user_id
      if (!tgUserId) {
        const { data: tgAccount } = await supabase
          .from('accounts')
          .select('provider_account_id')
          .eq('user_id', user.id)
          .eq('provider', 'telegram')
          .limit(1)
          .single()
        if (tgAccount) tgUserId = parseInt(tgAccount.provider_account_id, 10)
      }

      let groupNames: string[] = []
      const { data: groups } = await supabase
        .from('org_telegram_groups')
        .select('telegram_group_id')
        .eq('org_id', sub.org_id)
      if (groups && groups.length > 0) {
        const groupIds = groups.map(g => g.telegram_group_id)
        const { data: groupDetails } = await supabase
          .from('telegram_groups')
          .select('id, title')
          .in('id', groupIds)
        if (groupDetails) groupNames = groupDetails.map(g => g.title).filter(Boolean)
      }

      const billingUrl = `https://my.orbo.ru/p/${sub.org_id}/settings?tab=billing`
      const expiresFormatted = expiresAt.toLocaleDateString('ru-RU')

      const expired = daysLeft <= 0

      if (user.email) {
        try {
          const { sendEmail } = await import('@/lib/services/email')
          await sendEmail({
            to: user.email,
            subject: expired
              ? `Подписка на Orbo Pro истекла — ${org.name}`
              : `Подписка на Orbo Pro истекает ${expiresFormatted}`,
            html: getBillingExpiryEmailTemplate({
              userName: user.name || undefined,
              orgName: org.name,
              expiresFormatted,
              expired,
              daysLeft,
              billingUrl,
              paymentUrl: sub.payment_url || PAYMENT_URL,
              groupNames,
            }),
            tags: ['billing', expired ? 'expired' : 'expiring'],
          })
        } catch (emailErr) {
          logger.error({ org_id: sub.org_id, error: emailErr instanceof Error ? emailErr.message : String(emailErr) }, 'Failed to send billing email')
        }
      }

      if (tgUserId) {
        try {
          const { TelegramService } = await import('@/lib/services/telegramService')
          const daysWord = daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дня' : 'дней'

          const tgText = expired
            ? `⚠️ Подписка Orbo Pro для «${org.name}» истекла.\n\nОплатите продление, чтобы продолжить использование всех функций без ограничений.\n\n💳 Оплатить: ${sub.payment_url || PAYMENT_URL}\n📋 Управление: ${billingUrl}`
            : `⏰ Подписка Orbo Pro для «${org.name}» истекает через ${daysLeft} ${daysWord} (${expiresFormatted}).\n\n${groupNames.length > 0 ? `Подключенные группы: ${groupNames.join(', ')}\n\n` : ''}💳 Продлить: ${sub.payment_url || PAYMENT_URL}\n📋 Управление: ${billingUrl}`

          for (const botType of ['notifications', 'registration'] as const) {
            try {
              const tg = new TelegramService(botType)
              await tg.sendMessage(tgUserId, tgText, { parse_mode: undefined })
            } catch {
              // bot may not be configured, skip silently
            }
          }
        } catch (tgErr) {
          logger.error({ org_id: sub.org_id, error: tgErr instanceof Error ? tgErr.message : String(tgErr) }, 'Failed to send billing TG notification')
        }
      }

      await supabase.from('notification_logs').insert({
        org_id: sub.org_id,
        type: 'billing_expiry',
        dedup_hash: dedupKey,
        channel: 'multi',
        status: 'sent',
        details: { days_left: daysLeft, expired, org_name: org.name },
      }).then(() => {}, () => {})

      stats.notified++
    } catch (err) {
      logger.error({ org_id: sub.org_id, error: err instanceof Error ? err.message : String(err) }, 'Error processing expiring subscription')
      stats.errors++
    }
  }

  return stats
}

// ----- Billing email template -----

function getBillingExpiryEmailTemplate(params: {
  userName?: string
  orgName: string
  expiresFormatted: string
  expired: boolean
  daysLeft: number
  billingUrl: string
  paymentUrl: string
  groupNames: string[]
}): string {
  const { userName, orgName, expiresFormatted, expired, daysLeft, billingUrl, paymentUrl, groupNames } = params
  const daysWord = daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дня' : 'дней'

  const statusText = expired
    ? 'Ваша подписка на тариф <strong>Профессиональный</strong> истекла.'
    : `Подписка на тариф <strong>Профессиональный</strong> истекает через <strong>${daysLeft} ${daysWord}</strong> (${expiresFormatted}).`

  const groupsHtml = groupNames.length > 0
    ? `<p style="font-size: 14px; color: #4b5563; margin-bottom: 16px;">Подключенные группы: <strong>${groupNames.join(', ')}</strong></p>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    ${userName ? `<p style="font-size: 16px; margin-bottom: 8px;">Привет, ${userName}!</p>` : ''}
    <p style="font-size: 16px; margin-bottom: 16px;">Пространство: <strong>${orgName}</strong></p>
    <p style="font-size: 16px; margin-bottom: 16px;">${statusText}</p>
    ${groupsHtml}
    <p style="font-size: 14px; color: #4b5563; margin-bottom: 24px;">
      ${expired
        ? 'Без активной подписки ограничивается доступ к AI-функциям и работа с числом участников свыше 1000.'
        : 'После окончания подписки ограничится доступ к AI-функциям и работе с числом участников свыше 1000.'}
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${paymentUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        ${expired ? 'Оплатить подписку' : 'Продлить подписку'}
      </a>
    </div>
    <p style="font-size: 13px; color: #9ca3af; text-align: center;">
      <a href="${billingUrl}" style="color: #667eea;">Управление тарифом →</a>
    </p>
  </div>
  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">Orbo — CRM участников и событий для Telegram-сообществ</p>
    <p style="margin: 5px 0;"><a href="https://orbo.ru" style="color: #9ca3af;">orbo.ru</a></p>
  </div>
</body>
</html>`.trim()
}
