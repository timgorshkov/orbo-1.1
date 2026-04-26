import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { initiatePayment } from '@/lib/services/paymentService'
import { getPlanByCode } from '@/lib/services/billingService'
import { createAdminServer } from '@/lib/server/supabaseServer'
import type { GatewayCode } from '@/lib/services/paymentGateway'

export const dynamic = 'force-dynamic'

const checkoutBuckets = new Map<string, { count: number; resetAt: number }>()
const CHECKOUT_RATE_LIMIT = 5
const CHECKOUT_RATE_WINDOW_MS = 300_000

function isCheckoutRateLimited(key: string): boolean {
  const now = Date.now()
  const bucket = checkoutBuckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    checkoutBuckets.set(key, { count: 1, resetAt: now + CHECKOUT_RATE_WINDOW_MS })
    return false
  }
  bucket.count++
  return bucket.count > CHECKOUT_RATE_LIMIT
}

/**
 * POST /api/billing/checkout
 *
 * Initiates a subscription payment (tariff plan).
 * Only owner can initiate. Creates a payment_session with payment_for='subscription',
 * stores customer data in metadata for later receipt/act generation.
 *
 * Body:
 *   orgId: string
 *   planCode: 'pro' | 'enterprise' (must have price > 0)
 *   periodMonths: 1 | 3 | 12
 *   gatewayCode: 'tbank' | 'yookassa'
 *   customerName: string (ФИО for individuals or org name for legal entities)
 *   customerEmail: string (required for receipt)
 *   customerPhone?: string
 *   customerInn?: string (for legal entities)
 *   customerType?: 'individual' | 'legal_entity' | 'self_employed'
 *   returnUrl?: string (defaults to current org billing page)
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/billing/checkout' })

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isCheckoutRateLimited(user.id)) {
    return NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const {
      orgId,
      planCode,
      periodMonths,
      gatewayCode,
      customerName,
      customerEmail,
      customerPhone,
      customerInn,
      customerType,
      returnUrl: customReturnUrl,
    } = body

    // Validation
    if (!orgId || !planCode || !periodMonths || !gatewayCode) {
      return NextResponse.json({
        error: 'orgId, planCode, periodMonths, and gatewayCode are required'
      }, { status: 400 })
    }

    if (![1, 3, 12].includes(Number(periodMonths))) {
      return NextResponse.json({ error: 'periodMonths must be 1, 3, or 12' }, { status: 400 })
    }

    if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 4) {
      return NextResponse.json({ error: 'Укажите ФИО или название организации' }, { status: 400 })
    }

    if (!customerEmail || !isValidEmail(customerEmail)) {
      return NextResponse.json({ error: 'Укажите корректный email для чека' }, { status: 400 })
    }

    // Name validation for individuals (basic sanity)
    const resolvedCustomerType = customerType || 'individual'
    if (resolvedCustomerType === 'individual' && !isValidFullName(customerName)) {
      return NextResponse.json({
        error: 'ФИО должно содержать минимум 2 слова и выглядеть как реальное имя'
      }, { status: 400 })
    }

    // Access control: only owner
    const role = await getEffectiveOrgRole(user.id, orgId)
    if (!role || role.role !== 'owner') {
      return NextResponse.json({ error: 'Только владелец может оплатить тариф' }, { status: 403 })
    }

    // Load plan and compute amount
    const plan = await getPlanByCode(planCode)
    if (!plan || !plan.price_monthly || plan.price_monthly <= 0) {
      return NextResponse.json({ error: 'Выбранный тариф недоступен для оплаты' }, { status: 400 })
    }

    const amount = plan.price_monthly * Number(periodMonths)

    // Resolve org name for description
    const db = createAdminServer()
    const { data: org } = await db.from('organizations').select('name').eq('id', orgId).single()
    const orgName = org?.name || 'организация'

    // Для физлица-покупателя — сохранить/обновить данные лицензиата.
    // Первая оплата — форма была пустой и пользователь ввёл их впервые; при
    // повторной оплате поля предзаполнены и пользователь мог их подправить —
    // новые данные применяются ко всем последующим актам.
    if (resolvedCustomerType === 'individual') {
      const { error: licenseeErr } = await db.raw(
        `UPDATE organizations
            SET licensee_full_name = $1,
                licensee_email     = $2
          WHERE id = $3`,
        [customerName.trim(), customerEmail.trim(), orgId]
      )
      if (licenseeErr) {
        logger.warn(
          { org_id: orgId, error: licenseeErr.message },
          'Failed to save licensee full name/email on checkout'
        )
      }
    }

    // Determine return URL
    const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
    const baseReturnUrl = customReturnUrl || `${appBase}/p/${orgId}/pay?sessionId=`

    const result = await initiatePayment({
      orgId,
      paymentFor: 'subscription',
      amount,
      currency: 'RUB',
      description: `Тариф «${plan.name}» на ${periodMonths} мес. (${orgName})`,
      gatewayCode: gatewayCode as GatewayCode,
      returnUrl: baseReturnUrl,
      createdBy: user.id,
      metadata: {
        plan_code: planCode,
        period_months: Number(periodMonths),
        customer: {
          type: resolvedCustomerType,
          name: customerName.trim(),
          email: customerEmail.trim(),
          phone: customerPhone || null,
          inn: customerInn || null,
        },
      },
    })

    logger.info({
      org_id: orgId,
      user_id: user.id,
      plan_code: planCode,
      period_months: periodMonths,
      amount,
      session_id: result.session.id,
    }, 'Subscription checkout initiated')

    return NextResponse.json({
      success: true,
      sessionId: result.session.id,
      redirectUrl: result.redirectUrl,
      amount,
    })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Checkout failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/**
 * Basic sanity check for individual's full name.
 * - At least 2 words
 * - Each word at least 2 chars
 * - Cyrillic/Latin letters, hyphens, dots, spaces only
 * - Rejects obvious placeholders (тест, test, digits)
 */
function isValidFullName(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed.length < 4) return false

  // Allow only letters, hyphens, dots, spaces
  if (!/^[А-Яа-яЁёA-Za-z\s.\-]+$/.test(trimmed)) return false

  const words = trimmed.split(/\s+/).filter(w => w.length > 0)
  if (words.length < 2) return false
  if (words.some(w => w.length < 2)) return false

  const lower = trimmed.toLowerCase()
  const banned = ['тест', 'test', 'проба', 'админ', 'admin', 'иван иванов', 'тест тестович', 'user', 'юзер']
  if (banned.some(b => lower === b || lower.includes('1-2-3') || lower.includes('123'))) return false

  // Detect obvious repetitions (aaaa, бббб)
  if (words.some(w => /^(.)\1{2,}$/.test(w))) return false

  return true
}
