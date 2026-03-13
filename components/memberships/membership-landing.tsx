'use client'

import { Crown, Check, ExternalLink, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const PERIOD_LABELS: Record<string, string> = {
  one_time: 'разовый платёж',
  weekly: 'в неделю',
  monthly: 'в месяц',
  quarterly: 'в квартал',
  semi_annual: 'в полгода',
  annual: 'в год',
  custom: '',
}

interface Plan {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  billing_period: string
  custom_period_days: number | null
  trial_days: number
  is_public: boolean
  payment_link: string | null
  payment_instructions: string | null
}

interface Org {
  id: string
  name: string
  logo_url: string | null
  description: string | null
}

interface MembershipLandingContentProps {
  org: Org
  plans: Plan[]
}

export function MembershipLandingContent({ org, plans }: MembershipLandingContentProps) {
  if (plans.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{org.name}</h1>
          <p className="text-gray-500">Планы членства пока не настроены</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          {org.logo_url ? (
            <img src={org.logo_url} alt={org.name} className="h-16 w-16 rounded-2xl object-cover mx-auto mb-4 shadow-sm" />
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Crown className="h-8 w-8 text-emerald-600" />
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{org.name}</h1>
          {org.description && <p className="text-gray-600 max-w-md mx-auto">{org.description}</p>}
          <p className="text-emerald-700 font-medium mt-3">Станьте участником клуба</p>
        </div>

        {/* Plans */}
        <div className={`grid gap-6 ${plans.length === 1 ? 'max-w-md mx-auto' : plans.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
          {plans.map((plan, idx) => (
            <Card key={plan.id} className={`relative overflow-hidden ${idx === 0 ? 'border-emerald-300 shadow-lg' : 'border-gray-200'}`}>
              {idx === 0 && plans.length > 1 && (
                <div className="bg-emerald-600 text-white text-xs font-semibold text-center py-1">
                  Рекомендуем
                </div>
              )}
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                {plan.description && (
                  <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                )}

                <div className="mb-6">
                  {plan.price ? (
                    <div>
                      <span className="text-3xl font-bold text-gray-900">
                        {plan.price.toLocaleString('ru-RU')}
                      </span>
                      <span className="text-lg text-gray-500 ml-1">₽</span>
                      <span className="text-sm text-gray-500 ml-1">
                        {PERIOD_LABELS[plan.billing_period] || `/ ${plan.custom_period_days} дн.`}
                      </span>
                    </div>
                  ) : (
                    <div className="text-3xl font-bold text-emerald-600">Бесплатно</div>
                  )}
                  {plan.trial_days > 0 && (
                    <p className="text-sm text-blue-600 mt-1">
                      Пробный период: {plan.trial_days} дн. бесплатно
                    </p>
                  )}
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Доступ к закрытым группам</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Эксклюзивные материалы</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Закрытые события</span>
                  </div>
                </div>

                {plan.payment_link ? (
                  <a
                    href={plan.payment_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition"
                  >
                    <CreditCard className="h-4 w-4" />
                    {plan.price ? 'Оплатить' : 'Вступить'}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <Button className="w-full" size="lg" disabled>
                    Свяжитесь с организатором
                  </Button>
                )}

                {plan.payment_instructions && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 whitespace-pre-wrap">
                    {plan.payment_instructions}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          После оплаты администратор подтвердит ваше участие и откроет доступ
        </p>
      </div>
    </div>
  )
}
