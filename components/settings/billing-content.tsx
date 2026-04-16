'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PlanCards from '@/components/billing/plan-cards'
import { Crown, Users, Calendar, ExternalLink, Clock, CreditCard, FileText, Download, Loader2, X } from 'lucide-react'

interface BillingData {
  plan: { code: string; name: string; price_monthly: number | null; description: string | null }
  subscription: { status: string; started_at: string; expires_at: string | null } | null
  participantCount: number
  participantLimit: number
  isOverLimit: boolean
  paymentUrl: string
  aiEnabled: boolean
  isTrial: boolean
  trialDaysRemaining: number
  trialExpired: boolean
  trialWarning: boolean
  invoices: Array<{
    id: string
    amount: number
    currency: string
    period_start: string
    period_end: string
    status: string
    paid_at: string | null
    created_at: string
    act_number?: string | null
    act_document_url?: string | null
  }>
  ownerEmail?: string | null
  licenseeFullName?: string | null
  licenseeEmail?: string | null
}

interface AllPlans {
  code: string
  name: string
  description: string | null
  price_monthly: number | null
}

export default function BillingContent() {
  const params = useParams()
  const orgId = params?.org as string
  const [data, setData] = useState<BillingData | null>(null)
  const [plans, setPlans] = useState<AllPlans[]>([])
  const [loading, setLoading] = useState(true)
  // Checkout modal state — lifted to top-level so both PaymentSection and PlanCards can trigger it
  const [checkoutPlanCode, setCheckoutPlanCode] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      fetch(`/api/billing/status?orgId=${orgId}`).then(r => r.ok ? r.json() : null),
      fetch('/api/billing/plans').then(r => r.ok ? r.json() : null),
    ]).then(([statusData, plansData]) => {
      if (statusData && statusData.plan) setData(statusData)
      setPlans(plansData?.plans || [])
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [orgId])

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-48" /><div className="h-48 bg-gray-200 rounded" /></div>
  }

  if (!data) {
    return <div className="text-gray-500">Не удалось загрузить данные о тарифе</div>
  }

  const limitDisplay = data.participantLimit === -1 ? '∞' : data.participantLimit.toLocaleString('ru-RU')
  const usagePercent = data.participantLimit > 0 ? Math.min(100, Math.round((data.participantCount / data.participantLimit) * 100)) : 0

  const statusLabel = data.isTrial
    ? (data.trialExpired ? 'Триал завершён' : 'Пробный период')
    : (data.subscription?.status === 'active' ? 'Активен' : data.subscription?.status || 'Активен')

  const statusColor = data.isTrial
    ? (data.trialExpired ? 'text-red-600' : (data.trialWarning ? 'text-orange-600' : 'text-blue-600'))
    : 'text-gray-900'

  return (
    <div className="space-y-8">
      {/* Trial banner */}
      {data.isTrial && !data.trialExpired && (
        <div className={`rounded-xl p-4 border ${data.trialWarning ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-3">
            <Clock className={`h-5 w-5 flex-shrink-0 ${data.trialWarning ? 'text-orange-500' : 'text-blue-500'}`} />
            <div>
              <p className={`font-medium ${data.trialWarning ? 'text-orange-700' : 'text-blue-700'}`}>
                Пробный период: осталось {data.trialDaysRemaining} {data.trialDaysRemaining === 1 ? 'день' : data.trialDaysRemaining <= 4 ? 'дня' : 'дней'}
              </p>
              <p className={`text-sm mt-0.5 ${data.trialWarning ? 'text-orange-600' : 'text-blue-600'}`}>
                {data.trialWarning
                  ? 'Скоро завершится пробный период. Оплатите подписку, чтобы продолжить работу без ограничений.'
                  : 'Вы используете бесплатный пробный период тарифа Профессиональный. Все функции доступны.'}
              </p>
            </div>
            {data.trialWarning && (
              <a
                href={data.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex-shrink-0 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition"
              >
                Оплатить
              </a>
            )}
          </div>
        </div>
      )}

      {data.isTrial && data.trialExpired && (
        <div className="rounded-xl p-4 border bg-red-50 border-red-200">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <p className="font-medium text-red-700">Пробный период завершён</p>
              <p className="text-sm mt-0.5 text-red-600">
                Оплатите подписку на тариф Профессиональный для продолжения работы.
              </p>
            </div>
            <a
              href={data.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex-shrink-0 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
            >
              Оплатить
            </a>
          </div>
        </div>
      )}

      {/* Current plan summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Crown className="h-6 w-6 text-purple-600" />
          <h2 className="text-xl font-semibold">Текущий тариф</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Тариф</div>
            <div className="text-lg font-semibold text-gray-900">
              {data.plan.name}
              {data.isTrial && !data.trialExpired && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">TRIAL</span>
              )}
            </div>
            {data.plan.price_monthly !== null && data.plan.price_monthly > 0 && (
              <div className="text-sm text-gray-500">{data.plan.price_monthly.toLocaleString('ru-RU')} ₽/мес</div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
              <Users className="h-3.5 w-3.5" /> Участники
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {data.participantCount.toLocaleString('ru-RU')} / {limitDisplay}
            </div>
            {data.participantLimit > 0 && (
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
              <Calendar className="h-3.5 w-3.5" /> Статус
            </div>
            <div className={`text-lg font-semibold ${statusColor}`}>
              {statusLabel}
            </div>
            {data.subscription?.expires_at && (
              <div className="text-sm text-gray-500">
                до {new Date(data.subscription.expires_at).toLocaleDateString('ru-RU')}
              </div>
            )}
          </div>
        </div>

        {data.isOverLimit && !data.isTrial && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 font-medium">
              Лимит участников превышен. Перейдите на тариф Профессиональный для продолжения работы.
            </p>
            <a
              href={data.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-red-700 hover:text-red-800"
            >
              Оплатить <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Payment section */}
      <PaymentSection
        orgId={orgId}
        planCode={data.plan.code}
        planName={data.plan.name}
        priceMonthly={data.plan.price_monthly}
        currentExpiresAt={data.subscription?.expires_at || null}
        isTrial={data.isTrial}
        trialExpired={data.trialExpired}
        ownerEmail={data.ownerEmail || null}
        plans={plans}
        onSelectPlan={(code) => setCheckoutPlanCode(code)}
      />

      {/* Plan cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Доступные тарифы</h2>
        <PlanCards
          plans={plans.filter(p => p.code !== 'promo')}
          currentPlanCode={data.plan.code}
          onSelectPlan={(code) => setCheckoutPlanCode(code)}
        />
      </div>

      {/* Centralized checkout modal — triggered by either PaymentSection or PlanCards */}
      {checkoutPlanCode && (
        <CheckoutModal
          orgId={orgId}
          plans={plans.filter(p => p.price_monthly && p.price_monthly > 0)}
          initialPlanCode={checkoutPlanCode}
          ownerEmail={data.ownerEmail || ''}
          licenseeFullName={data.licenseeFullName || ''}
          licenseeEmail={data.licenseeEmail || ''}
          onClose={() => setCheckoutPlanCode(null)}
        />
      )}

      {/* Licensee info (only if filled in — for physical-person licensees) */}
      {(data.licenseeFullName || data.licenseeEmail) && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Лицензиат</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-purple-600">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                {data.licenseeFullName && (
                  <div className="text-sm text-gray-900 font-medium">{data.licenseeFullName}</div>
                )}
                {data.licenseeEmail && (
                  <div className="text-xs text-gray-500 mt-0.5">{data.licenseeEmail}</div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  На имя лицензиата оформляются акты передачи неисключительных прав на
                  ПО «Orbo» по оплачиваемым тарифам. Реквизиты указаны при первой оплате
                  и используются в каждом акте.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice history */}
      {data.invoices && data.invoices.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">История платежей</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Дата</th>
                  <th className="px-4 py-3 font-medium">Период</th>
                  <th className="px-4 py-3 font-medium">Сумма</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Акт</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3">{new Date(inv.created_at).toLocaleDateString('ru-RU')}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(inv.period_start).toLocaleDateString('ru-RU')} — {new Date(inv.period_end).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 font-medium">{inv.amount.toLocaleString('ru-RU')} ₽</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : inv.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                        {inv.status === 'paid' ? 'Оплачен' : inv.status === 'pending' ? 'Ожидает' : inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inv.act_document_url ? (
                        <a
                          href={inv.act_document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-800 text-xs"
                          title={inv.act_number || 'Скачать акт'}
                        >
                          <Download className="h-3.5 w-3.5" />
                          {inv.act_number || 'Акт'}
                        </a>
                      ) : inv.status === 'paid' ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentSection({
  orgId,
  planCode,
  planName,
  priceMonthly,
  currentExpiresAt,
  isTrial,
  trialExpired,
  ownerEmail,
  plans,
}: {
  orgId: string
  planCode: string
  planName?: string
  priceMonthly: number | null
  currentExpiresAt: string | null
  isTrial: boolean
  trialExpired: boolean
  ownerEmail?: string | null
  plans: AllPlans[]
  onSelectPlan: (code: string) => void
}) {
  const paidPlans = plans.filter(p => p.price_monthly && p.price_monthly > 0)
  const isExtension = currentExpiresAt && new Date(currentExpiresAt) > new Date() && !isTrial

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <CreditCard className="h-6 w-6 text-purple-600" />
        <h2 className="text-xl font-semibold">Оплата</h2>
      </div>

      {paidPlans.length === 0 ? (
        <p className="text-sm text-gray-500">Платные тарифы временно недоступны</p>
      ) : (
        <>
          {/* Quick actions for each paid plan */}
          <div className="space-y-3">
            {paidPlans.map(p => (
              <div
                key={p.code}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  p.code === planCode ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
                }`}
              >
                <div>
                  <div className="font-medium">Тариф «{p.name}»</div>
                  <div className="text-sm text-gray-500">{p.price_monthly?.toLocaleString('ru-RU')} ₽ / мес</div>
                </div>
                <button
                  onClick={() => onSelectPlan(p.code)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition"
                >
                  {p.code === planCode ? (isExtension ? 'Продлить' : 'Оплатить') : 'Выбрать'}
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Оплата картой через защищённую форму T-Bank. После оплаты подписка активируется автоматически, чек и акт придут на email.
          </p>
        </>
      )}
    </div>
  )
}

function CheckoutModal({
  orgId,
  plans,
  initialPlanCode,
  ownerEmail,
  licenseeFullName,
  licenseeEmail,
  onClose,
}: {
  orgId: string
  plans: AllPlans[]
  initialPlanCode: string
  ownerEmail: string
  licenseeFullName: string
  licenseeEmail: string
  onClose: () => void
}) {
  const [planCode, setPlanCode] = useState(initialPlanCode)
  const [periodMonths, setPeriodMonths] = useState<1 | 3 | 12>(1)
  // Предзаполняем ФИО/email лицензиата из organizations.licensee_*, если уже
  // сохранены (не первая оплата). Поля остаются редактируемыми.
  const [customerName, setCustomerName] = useState(licenseeFullName || '')
  const [customerEmail, setCustomerEmail] = useState(licenseeEmail || ownerEmail)
  const hasSavedLicensee = !!licenseeFullName
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPlan = plans.find(p => p.code === planCode)
  const price = selectedPlan?.price_monthly || 0
  const total = price * periodMonths

  const handleCheckout = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          planCode,
          periodMonths,
          gatewayCode: 'tbank',
          customerName,
          customerEmail,
          customerType: 'individual',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка при создании платежа')
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
      } else {
        throw new Error('Не получили ссылку на оплату')
      }
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Оплата тарифа</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Plan selector */}
        <div>
          <label className="text-sm font-medium block mb-2">Тариф</label>
          <div className="grid grid-cols-2 gap-2">
            {plans.map(p => (
              <button
                key={p.code}
                onClick={() => setPlanCode(p.code)}
                className={`p-3 rounded-lg border-2 text-left transition ${
                  planCode === p.code ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-gray-500">{p.price_monthly?.toLocaleString('ru-RU')} ₽/мес</div>
              </button>
            ))}
          </div>
        </div>

        {/* Period selector */}
        <div>
          <label className="text-sm font-medium block mb-2">Период</label>
          <div className="grid grid-cols-3 gap-2">
            {([1, 3, 12] as const).map(months => (
              <button
                key={months}
                onClick={() => setPeriodMonths(months)}
                className={`p-3 rounded-lg border-2 text-center transition ${
                  periodMonths === months ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{months} мес</div>
                <div className="text-xs text-gray-500">{(price * months).toLocaleString('ru-RU')} ₽</div>
              </button>
            ))}
          </div>
        </div>

        {/* Customer name */}
        <div>
          <label className="text-sm font-medium block mb-1">
            ФИО лицензиата <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Иванов Иван Иванович"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            {hasSavedLicensee
              ? 'Данные лицензиата сохранены. Их можно изменить — новые данные будут использованы в этом и последующих актах.'
              : 'На это имя будут оформляться акты передачи неисключительных прав по всем оплачиваемым тарифам этой организации.'}
          </p>
        </div>

        {/* Email */}
        <div>
          <label className="text-sm font-medium block mb-1">
            Email для чека <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={customerEmail}
            onChange={e => setCustomerEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">На этот email придёт фискальный чек</p>
        </div>

        {/* Total */}
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-purple-700">К оплате</span>
            <span className="text-2xl font-bold text-purple-900">{total.toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleCheckout}
            disabled={loading || !customerName.trim() || !customerEmail.trim()}
            className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Переход к оплате...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Оплатить картой
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
