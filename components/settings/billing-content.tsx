'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PlanCards from '@/components/billing/plan-cards'
import { Crown, Users, Calendar, ExternalLink, Clock } from 'lucide-react'

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
  }>
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

      {/* Plan cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Доступные тарифы</h2>
        <PlanCards
          plans={plans}
          currentPlanCode={data.plan.code}
          paymentUrl={data.paymentUrl}
        />
        <p className="text-sm text-gray-500 mt-4 text-center">
          По вопросам корпоративного плана: <a href="mailto:tg@orbo.ru" className="text-purple-600 hover:underline">tg@orbo.ru</a>
        </p>
      </div>

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
