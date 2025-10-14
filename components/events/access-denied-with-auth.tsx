'use client'

import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import TelegramBotAuth from '@/components/auth/telegram-bot-auth'

type Props = {
  orgId: string
  orgName: string
  eventId: string
  isAuthenticated: boolean
}

export default function AccessDeniedWithAuth({ orgId, orgName, eventId, isAuthenticated }: Props) {
  // Проверяем наличие bot username
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const isBotConfigured = Boolean(botUsername && botUsername.trim().length > 0)

  const handleLogout = async () => {
    try {
      console.log('[AccessDenied] Logging out...')
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnUrl: `/p/${orgId}/events/${eventId}`
        })
      })

      if (res.ok) {
        console.log('[AccessDenied] Logout successful, reloading page')
        // Перезагружаем страницу для применения logout
        window.location.reload()
      } else {
        throw new Error('Failed to logout')
      }
    } catch (err) {
      console.error('[AccessDenied] Logout error:', err)
      // Fallback: просто перезагружаем
      window.location.reload()
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

          {!isAuthenticated && (
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

                  {/* Telegram Bot Auth */}
                  <div className="mb-6">
                    <TelegramBotAuth
                      orgId={orgId}
                      eventId={eventId}
                      redirectUrl={`/p/${orgId}/events/${eventId}`}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {isAuthenticated && (
            <div className="text-center py-4">
              <p className="text-gray-600 mb-4">
                Вы авторизованы, но не являетесь участником этого пространства
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleLogout}
                  className="w-full px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Выйти и войти через Telegram
                </button>
                <a
                  href="/orgs"
                  className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Вернуться к организациям
                </a>
              </div>
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

