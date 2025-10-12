'use client'

import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import TelegramLogin, { type TelegramUser } from '@/components/auth/telegram-login'

type Props = {
  orgId: string
  orgName: string
  eventId: string
  isAuthenticated: boolean
}

export default function AccessDeniedWithAuth({ orgId, orgName, eventId, isAuthenticated }: Props) {
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Проверяем наличие bot username
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const isBotConfigured = Boolean(botUsername && botUsername.trim().length > 0)

  const handleTelegramAuth = async (user: TelegramUser) => {
    setIsAuthLoading(true)
    setError(null)

    try {
      console.log('Authenticating via Telegram...', user)
      
      // Авторизуемся через Telegram
      const authRes = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramData: user,
          orgId: orgId
        })
      })

      const authData = await authRes.json()

      if (!authRes.ok) {
        throw new Error(authData.error || 'Ошибка авторизации')
      }

      console.log('Authentication successful, redirecting...', authData)

      // Перенаправляем на magic link для установки сессии
      if (authData.redirectUrl) {
        // Сохраняем URL события в localStorage для редиректа после авторизации
        localStorage.setItem('post_auth_redirect', `/p/${orgId}/events/${eventId}`)
        window.location.href = authData.redirectUrl
      } else {
        // Или просто перезагружаем страницу
        window.location.reload()
      }
    } catch (err) {
      console.error('Authentication error:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
      setIsAuthLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Доступ ограничен
            </h1>
            <p className="text-gray-600 mb-4">
              Это событие доступно только участникам пространства <strong>{orgName}</strong>
            </p>
          </div>

          {!isAuthenticated && !isAuthLoading && !error && (
            <>
              {!isBotConfigured ? (
                // Ошибка конфигурации
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800 mb-1">
                        Авторизация временно недоступна
                      </p>
                      <p className="text-sm text-red-700">
                        Сервис находится в процессе настройки. Пожалуйста, попробуйте позже или свяжитесь с администратором.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Если вы участник одной из Telegram-групп этого пространства, войдите через Telegram для получения доступа
                    </p>
                  </div>

                  {/* Telegram Login */}
                  <div className="flex justify-center mb-6">
                    <TelegramLogin
                      botUsername={botUsername!}
                      onAuth={handleTelegramAuth}
                      buttonSize="large"
                      cornerRadius={12}
                    />
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <p className="text-xs text-gray-500 text-center">
                      После авторизации мы проверим ваше участие в группах и предоставим доступ к событию
                    </p>
                  </div>
                </>
              )}
            </>
          )}

          {/* Loading */}
          {isAuthLoading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">
                Проверяем ваше участие в группах...
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 mb-3">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  setIsAuthLoading(false)
                }}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Попробовать снова
              </button>
            </div>
          )}

          {isAuthenticated && (
            <div className="text-center py-4">
              <p className="text-gray-600 mb-4">
                Вы авторизованы, но не являетесь участником этого пространства
              </p>
              <a
                href="/orgs"
                className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Вернуться к организациям
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Нет доступа к группам?{' '}
            <a href="#" className="text-blue-600 hover:text-blue-800 font-medium">
              Запросить приглашение
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

