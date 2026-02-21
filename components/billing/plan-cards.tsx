'use client'

import { Check, Sparkles, Building2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PlanCardData {
  code: string
  name: string
  description: string | null
  price_monthly: number | null
  isCurrentPlan?: boolean
}

interface PlanCardsProps {
  plans: PlanCardData[]
  currentPlanCode?: string
  paymentUrl: string
  compact?: boolean
}

const FEATURES: Record<string, string[]> = {
  free: [
    'До 1 000 участников',
    'Telegram-группы',
    'CRM участников',
    'Аналитика активности',
    'События и регистрация',
    'Анонсы в группы',
  ],
  pro: [
    'Безлимитные участники',
    'Всё из Бесплатного',
    'AI-анализ участников',
    'Обнаружение негатива',
    'Обнаружение вопросов',
    'Пользовательские правила',
  ],
  enterprise: [
    'Всё из Профессионального',
    'Приоритетная поддержка',
    'API-доступ',
    'Индивидуальные лимиты',
    'SLA и интеграции',
    'Выделенный менеджер',
  ],
}

const PLAN_ICONS: Record<string, typeof Users> = {
  free: Users,
  pro: Sparkles,
  enterprise: Building2,
}

export default function PlanCards({ plans, currentPlanCode, paymentUrl, compact }: PlanCardsProps) {
  return (
    <div className={cn('grid gap-6', compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3')}>
      {plans.map((plan) => {
        const isCurrent = plan.code === currentPlanCode
        const isPro = plan.code === 'pro'
        const Icon = PLAN_ICONS[plan.code] || Users
        const features = FEATURES[plan.code] || []

        return (
          <div
            key={plan.code}
            className={cn(
              'relative rounded-2xl border p-6 flex flex-col',
              isPro ? 'border-purple-300 bg-purple-50/50 shadow-lg ring-2 ring-purple-200' : 'border-gray-200 bg-white',
              isCurrent && 'ring-2 ring-blue-400'
            )}
          >
            {isPro && !compact && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold rounded-full">
                Популярный
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                'flex items-center justify-center w-10 h-10 rounded-lg',
                isPro ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                {isCurrent && (
                  <span className="text-xs text-blue-600 font-medium">Текущий тариф</span>
                )}
              </div>
            </div>

            {plan.description && (
              <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
            )}

            <div className="mb-6">
              {plan.price_monthly === 0 && (
                <div>
                  <span className="text-3xl font-bold text-gray-900">0 ₽</span>
                  <span className="text-gray-500"> / навсегда</span>
                </div>
              )}
              {plan.price_monthly && plan.price_monthly > 0 && (
                <div>
                  <span className="text-3xl font-bold text-gray-900">{plan.price_monthly.toLocaleString('ru-RU')} ₽</span>
                  <span className="text-gray-500"> / месяц</span>
                </div>
              )}
              {plan.price_monthly === null && (
                <div>
                  <span className="text-lg font-semibold text-gray-900">Индивидуально</span>
                </div>
              )}
            </div>

            <ul className="space-y-2 mb-6 flex-1">
              {features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <Check className={cn('h-4 w-4 mt-0.5 flex-shrink-0', isPro ? 'text-purple-500' : 'text-green-500')} />
                  {feature}
                </li>
              ))}
            </ul>

            {plan.code === 'free' && (
              isCurrent ? (
                <div className="py-2.5 text-center text-sm text-gray-400 border border-gray-200 rounded-xl">
                  Активен
                </div>
              ) : (
                <div className="py-2.5 text-center text-sm text-gray-400 border border-gray-200 rounded-xl">
                  Бесплатный
                </div>
              )
            )}

            {plan.code === 'pro' && (
              isCurrent ? (
                <div className="py-2.5 text-center text-sm font-medium text-purple-600 border border-purple-300 rounded-xl bg-purple-50">
                  Активен
                </div>
              ) : (
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-2.5 text-center text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition shadow"
                >
                  Оплатить
                </a>
              )
            )}

            {plan.code === 'enterprise' && (
              <a
                href="mailto:tg@orbo.ru"
                className="block py-2.5 text-center text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 transition"
              >
                Связаться с нами
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
