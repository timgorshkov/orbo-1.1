'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import TelegramLogin, { type TelegramUser } from '@/components/auth/telegram-login'
import Link from 'next/link'

export default function TelegramLoginClient() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const redirectTo = searchParams.get('redirect') || '/orgs'

  const handleTelegramAuth = async (user: TelegramUser) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramData: user
        })
      })

      const data = await res.json()

      if (!res.ok) {
        // Если нет доступа ни к одной организации
        if (data.needsInvite) {
          setError('У вас нет доступа ни к одной организации. Попросите администратора отправить вам ссылку-приглашение.')
          setIsLoading(false)
          return
        }
        
        throw new Error(data.error || 'Ошибка авторизации')
      }

      if (data.success && data.redirectUrl) {
        // Перенаправляем на magic link
        window.location.href = data.redirectUrl
      } else {
        // Если нет redirectUrl, перенаправляем вручную
        window.location.href = redirectTo
      }
    } catch (err) {
      console.error('Auth error:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка при авторизации')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Telegram Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Вход в систему
            </h1>
            <p className="text-gray-600">
              Быстрый вход для участников организаций
            </p>
          </div>

          {!isLoading && !error && (
            <>
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Для участников:</strong> Войдите через Telegram, если вы состоите в Telegram-группах организации или получили ссылку-приглашение.
                </p>
              </div>

              <div className="flex justify-center mb-6">
                <TelegramLogin
                  botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || ''}
                  onAuth={handleTelegramAuth}
                  buttonSize="large"
                  cornerRadius={12}
                />
              </div>
            </>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Авторизация...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 mb-3">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Попробовать снова
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-500">
              или
            </span>
          </div>
        </div>

        {/* Email/Password Login */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Вход для владельцев
            </h2>
            <p className="text-sm text-gray-600">
              Если вы создали организацию через email
            </p>
          </div>

          <Link
            href="/signin"
            className="block w-full py-3 px-4 border border-gray-300 rounded-lg text-center font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Войти через Email
          </Link>
        </div>

        {/* Info */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Нет аккаунта?{' '}
            <Link href="/signup" className="text-blue-600 hover:text-blue-800 font-medium">
              Создать организацию
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

