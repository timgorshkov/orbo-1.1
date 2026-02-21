'use client'

import { X, Sparkles, Crown, ArrowRight, Clock } from 'lucide-react'

interface UpgradeDialogProps {
  isOpen: boolean
  onClose?: () => void
  blocking?: boolean
  reason?: 'participant_limit' | 'ai_feature'
  participantCount?: number
  participantLimit?: number
  paymentUrl: string
  planName?: string
  isTrial?: boolean
  trialDaysRemaining?: number
  trialExpired?: boolean
}

export default function UpgradeDialog({
  isOpen,
  onClose,
  blocking = false,
  reason = 'participant_limit',
  participantCount,
  participantLimit,
  paymentUrl,
  planName = 'Бесплатный',
  isTrial = false,
  trialDaysRemaining = 0,
  trialExpired = false,
}: UpgradeDialogProps) {
  if (!isOpen) return null

  // Determine title and description based on context
  let title: string
  let description: string

  if (isTrial && trialExpired) {
    title = 'Пробный период завершён'
    description = 'Бесплатный 14-дневный пробный период тарифа Профессиональный завершён. Для продолжения работы оплатите подписку.'
  } else if (isTrial && !trialExpired) {
    const daysWord = trialDaysRemaining === 1 ? 'день' : trialDaysRemaining <= 4 ? 'дня' : 'дней'
    title = `Пробный период: ${trialDaysRemaining} ${daysWord}`
    description = `Ваш бесплатный пробный период тарифа Профессиональный заканчивается через ${trialDaysRemaining} ${daysWord}. Оплатите подписку, чтобы продолжить пользоваться всеми возможностями.`
  } else if (reason === 'ai_feature') {
    title = 'Функция доступна на PRO'
    description = 'AI-анализ и пользовательские правила уведомлений доступны на тарифе Профессиональный.'
  } else {
    title = 'Лимит участников достигнут'
    description = `В вашем пространстве ${participantCount?.toLocaleString('ru-RU')} участников из ${participantLimit?.toLocaleString('ru-RU')} доступных на тарифе «${planName}».`
  }

  const headerIcon = isTrial ? Clock : (reason === 'participant_limit' ? Crown : Sparkles)
  const Icon = headerIcon

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={blocking ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header gradient */}
        <div className={`px-6 py-8 text-center text-white ${
          trialExpired ? 'bg-gradient-to-r from-red-600 to-orange-600' : 'bg-gradient-to-r from-purple-600 to-indigo-600'
        }`}>
          {!blocking && onClose && (
            <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition">
              <X className="h-5 w-5" />
            </button>
          )}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
            <Icon className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold">{title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <p className="text-gray-600 text-center">{description}</p>

          {/* Plan comparison */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Профессиональный тариф</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <span className="text-green-500 font-bold">✓</span>
                Безлимитное количество участников
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500 font-bold">✓</span>
                AI-анализ участников и групп
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500 font-bold">✓</span>
                Пользовательские правила уведомлений
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500 font-bold">✓</span>
                Обнаружение негатива и вопросов
              </li>
            </ul>
            <div className="pt-2 border-t border-gray-200">
              <span className="text-2xl font-bold text-gray-900">1 500 ₽</span>
              <span className="text-gray-500"> / месяц</span>
            </div>
          </div>

          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 w-full py-3 px-6 text-white rounded-xl font-semibold transition shadow-lg ${
              trialExpired
                ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
            }`}
          >
            {trialExpired ? 'Оплатить для продолжения' : 'Перейти к оплате'}
            <ArrowRight className="h-4 w-4" />
          </a>

          {!blocking && onClose && (
            <button
              onClick={onClose}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition"
            >
              {isTrial && !trialExpired ? 'Напомнить позже' : 'Позже'}
            </button>
          )}

          {blocking && (
            <p className="text-xs text-center text-red-500">
              Для продолжения работы необходимо оплатить подписку.
              После оплаты доступ будет восстановлен автоматически.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
