'use client'

import TelegramBotAuth from '@/components/auth/telegram-bot-auth'

interface JoinPageClientProps {
  orgId: string
  token: string
  orgName: string
  orgLogoUrl: string | null
  accessType: string
  description: string | null
}

const ACCESS_TYPE_LABELS: Record<string, { title: string; description: string }> = {
  full: {
    title: 'Полный доступ',
    description: 'Вы получите доступ к материалам, событиям и списку участников организации'
  },
  events_only: {
    title: 'Доступ к событиям',
    description: 'Вы сможете просматривать и регистрироваться на события организации'
  },
  materials_only: {
    title: 'Доступ к материалам',
    description: 'Вы получите доступ к материалам и документам организации'
  },
  limited: {
    title: 'Ограниченный доступ',
    description: 'Вы получите доступ к выбранным материалам и событиям'
  }
}

export default function JoinPageClient({
  orgId,
  token,
  orgName,
  orgLogoUrl,
  accessType,
  description
}: JoinPageClientProps) {
  const accessInfo = ACCESS_TYPE_LABELS[accessType] || ACCESS_TYPE_LABELS.full

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Лого организации */}
        <div className="flex flex-col items-center mb-6">
          {orgLogoUrl ? (
            <img
              src={orgLogoUrl}
              alt={orgName}
              className="h-20 w-20 rounded-xl object-cover mb-4"
            />
          ) : (
            <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold mb-4">
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Присоединяйтесь к {orgName}
          </h1>
        </div>

        {/* Описание доступа */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h2 className="text-sm font-semibold text-blue-900 mb-1">
            {accessInfo.title}
          </h2>
          <p className="text-sm text-blue-700">
            {description || accessInfo.description}
          </p>
        </div>

        {/* Инструкция */}
        <div className="mb-6">
          <p className="text-gray-600 text-center text-sm">
            Войдите через Telegram, чтобы получить доступ к организации
          </p>
        </div>

        {/* Telegram Bot Auth */}
        <TelegramBotAuth
          orgId={orgId}
          redirectUrl={`/app/${orgId}/dashboard`}
        />

        {/* Футер */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Используя Telegram для входа, вы соглашаетесь на обработку ваших данных
          </p>
        </div>
      </div>
    </div>
  )
}

