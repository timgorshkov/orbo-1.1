import { Header, Footer } from '@/components/website'
import { Check, X, Sparkles, Users, Building2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const PLANS = [
  {
    code: 'free',
    name: 'Бесплатный',
    description: 'Для небольших сообществ, начинающих с Orbo',
    price: 0,
    priceLabel: '0 ₽',
    priceSuffix: 'навсегда',
    icon: Users,
    highlighted: false,
    cta: 'Начать бесплатно',
    ctaHref: 'https://my.orbo.ru/signup',
    features: [
      { name: 'До 1 000 участников', included: true },
      { name: 'Telegram-группы', included: true },
      { name: 'CRM участников', included: true },
      { name: 'Аналитика активности', included: true },
      { name: 'События и регистрация', included: true },
      { name: 'Анонсы в группы', included: true },
      { name: 'AI-анализ участников', included: false },
      { name: 'Обнаружение негатива', included: false },
      { name: 'Пользовательские правила', included: false },
    ],
  },
  {
    code: 'pro',
    name: 'Профессиональный',
    description: 'Для растущих сообществ без ограничений',
    price: 1500,
    priceLabel: '1 500 ₽',
    priceSuffix: '/ месяц',
    icon: Sparkles,
    highlighted: true,
    cta: 'Оплатить',
    ctaHref: 'https://payform.ru/tkaK5Rn/',
    features: [
      { name: 'Безлимитные участники', included: true },
      { name: 'Всё из Бесплатного', included: true },
      { name: 'AI-анализ участников', included: true },
      { name: 'Обнаружение негатива', included: true },
      { name: 'Обнаружение вопросов', included: true },
      { name: 'Пользовательские правила', included: true },
      { name: 'Приоритетная поддержка', included: false },
      { name: 'API-доступ', included: false },
      { name: 'SLA и интеграции', included: false },
    ],
  },
  {
    code: 'enterprise',
    name: 'Корпоративный',
    description: 'Индивидуальные условия для крупных организаций',
    price: null,
    priceLabel: 'По запросу',
    priceSuffix: '',
    icon: Building2,
    highlighted: false,
    cta: 'Связаться с нами',
    ctaHref: 'mailto:tg@orbo.ru',
    features: [
      { name: 'Всё из Профессионального', included: true },
      { name: 'Приоритетная поддержка', included: true },
      { name: 'API-доступ', included: true },
      { name: 'Индивидуальные лимиты', included: true },
      { name: 'SLA и интеграции', included: true },
      { name: 'Выделенный менеджер', included: true },
      { name: 'Кастомные отчёты', included: true },
      { name: 'Обучение команды', included: true },
      { name: 'On-premise установка', included: true },
    ],
  },
]

export default function PricingPage() {
  return (
    <>
      <Header transparent={false} />

      <main className="pt-24 pb-20">
        {/* Hero */}
        <section className="text-center max-w-3xl mx-auto px-6 mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Тарифы Orbo
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Начните бесплатно и перейдите на Pro, когда ваше сообщество вырастет. Никаких скрытых платежей.
          </p>
        </section>

        {/* Plan cards */}
        <section className="max-w-6xl mx-auto px-6 mb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PLANS.map(plan => {
              const Icon = plan.icon
              return (
                <div
                  key={plan.code}
                  className={`relative rounded-2xl border p-8 flex flex-col ${
                    plan.highlighted
                      ? 'border-purple-300 bg-white shadow-xl ring-2 ring-purple-200 scale-[1.02]'
                      : 'border-gray-200 bg-white shadow-sm'
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold rounded-full shadow-md">
                      Популярный
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                      plan.highlighted ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                    </div>
                  </div>

                  <p className="text-gray-500 text-sm mb-6">{plan.description}</p>

                  <div className="mb-8">
                    <span className="text-4xl font-bold text-gray-900">{plan.priceLabel}</span>
                    {plan.priceSuffix && (
                      <span className="text-gray-500 ml-1">{plan.priceSuffix}</span>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        {f.included ? (
                          <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-purple-500' : 'text-green-500'}`} />
                        ) : (
                          <X className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-300" />
                        )}
                        <span className={f.included ? 'text-gray-700' : 'text-gray-400'}>
                          {f.name}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {plan.ctaHref.startsWith('mailto:') ? (
                    <a
                      href={plan.ctaHref}
                      className="flex items-center justify-center gap-2 py-3 px-6 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition"
                    >
                      {plan.cta}
                    </a>
                  ) : plan.highlighted ? (
                    <a
                      href={plan.ctaHref}
                      target={plan.ctaHref.startsWith('http') && !plan.ctaHref.includes('my.orbo.ru') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 transition shadow-lg"
                    >
                      {plan.cta}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ) : (
                    <Link
                      href={plan.ctaHref}
                      className="flex items-center justify-center gap-2 py-3 px-6 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition"
                    >
                      {plan.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Частые вопросы</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Что будет, если участников станет больше 1000?</h3>
              <p className="text-gray-600 text-sm">В течение 48 часов вы сможете продолжить работу. После этого потребуется перейти на тариф Профессиональный для продолжения.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Как происходит оплата?</h3>
              <p className="text-gray-600 text-sm">Оплата разовая за месяц. После оплаты тариф активируется автоматически. Можно оплатить банковской картой.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Что входит в AI-функции?</h3>
              <p className="text-gray-600 text-sm">AI-анализ поведения участников, автоматическое обнаружение негатива и неотвеченных вопросов в группах, пользовательские правила уведомлений с ИИ.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">По вопросам корпоративного тарифа?</h3>
              <p className="text-gray-600 text-sm">Напишите нам на <a href="mailto:tg@orbo.ru" className="text-purple-600 hover:underline">tg@orbo.ru</a> — обсудим индивидуальные условия.</p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
