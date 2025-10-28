'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface TelegramBotAuthProps {
  orgId?: string
  eventId?: string
  redirectUrl?: string
  onSuccess?: () => void
}

interface AuthCodeData {
  code: string
  botUsername: string
  deepLink: string
  qrUrl: string
  expiresAt: string
  expiresInSeconds: number
}

/**
 * Компонент для авторизации через Telegram бота с одноразовым кодом
 * Заменяет Telegram Login Widget для более надежной авторизации
 */
export default function TelegramBotAuth({ 
  orgId, 
  eventId, 
  redirectUrl, 
  onSuccess 
}: TelegramBotAuthProps) {
  const [authCode, setAuthCode] = useState<AuthCodeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [polling, setPolling] = useState(false)

  // Генерация кода при монтировании компонента
  useEffect(() => {
    generateCode()
  }, [orgId, eventId])

  // Таймер обратного отсчета
  useEffect(() => {
    if (!authCode) return

    const expiresAt = new Date(authCode.expiresAt).getTime()
    
    const interval = setInterval(() => {
      const now = Date.now()
      const left = Math.max(0, Math.floor((expiresAt - now) / 1000))
      setTimeLeft(left)

      if (left === 0) {
        clearInterval(interval)
        setError('Код истек. Обновите страницу для получения нового кода.')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [authCode])

  const generateCode = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/auth/telegram-code/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventId, redirectUrl })
      })

      if (!response.ok) {
        throw new Error('Не удалось сгенерировать код')
      }

      const data = await response.json()
      setAuthCode(data)
      setTimeLeft(data.expiresInSeconds)
      
      console.log('[TelegramBotAuth] Code generated:', data.code)
    } catch (err) {
      console.error('[TelegramBotAuth] Error:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Генерация кода...</span>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="text-center">
          <div className="text-red-600 mb-4">❌ {error}</div>
          <Button onClick={generateCode} variant="outline">
            Попробовать снова
          </Button>
        </div>
      </Card>
    )
  }

  if (!authCode) {
    return null
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="text-center">
        {/* Код для отправки - ПЕРВЫМ на экране */}
        <div className="mb-4">
          <p className="text-sm text-gray-700 mb-3 font-medium">Отправьте код в бот:</p>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 sm:p-6 font-mono text-2xl sm:text-3xl font-bold text-blue-600 select-all text-center cursor-pointer hover:border-blue-400 transition-colors">
            {authCode.code}
          </div>
          <p className="text-xs text-gray-500 mt-1.5 text-center">
            Нажмите на код, чтобы скопировать
          </p>
        </div>

        {/* Кнопка для открытия бота */}
        <div className="mb-4">
          <a 
            href={authCode.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white py-5 sm:py-6 text-base sm:text-lg">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.717-.962 3.928-1.36 5.214-.168.543-.5.725-.819.743-.695.03-1.223-.46-1.895-.9-1.054-.69-1.648-1.12-2.671-1.795-1.182-.78-.416-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212-.07-.062-.174-.041-.248-.024-.106.024-1.793 1.14-5.062 3.345-.479.331-.913.492-1.302.484-.428-.01-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.324-.437.892-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.001.321.023.465.14.121.099.155.232.171.325.016.094.036.308.02.475z"/>
              </svg>
              Открыть @{authCode.botUsername}
            </Button>
          </a>
          <p className="text-xs text-gray-600 mt-2">
            Введите <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/start</code> и отправьте код
          </p>
        </div>

        {/* Таймер - компактный */}
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-4">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Код действителен: </span>
          <span className={`font-mono font-semibold ${timeLeft < 60 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatTime(timeLeft)}
          </span>
        </div>

        {timeLeft < 60 && timeLeft > 0 && (
          <p className="text-xs text-red-600 mb-4 text-center">⚠️ Код скоро истечет!</p>
        )}

        {/* Кнопка обновления кода */}
        {timeLeft === 0 && (
          <div className="mb-4">
            <Button 
              onClick={generateCode} 
              variant="outline"
              size="sm"
              className="w-full"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Получить новый код
            </Button>
          </div>
        )}

        {/* Дополнительная информация - свернуто по умолчанию */}
        <details className="mt-4 text-left">
          <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800 font-medium text-center">
            📱 Показать QR-код и подробную инструкцию
          </summary>
          
          <div className="mt-4 space-y-4">
            {/* QR-код */}
            <div className="flex justify-center">
              <div className="relative">
                <img 
                  src={authCode.qrUrl} 
                  alt="QR Code" 
                  className="w-40 h-40 sm:w-48 sm:h-48 border-2 border-gray-300 rounded-lg"
                />
                {timeLeft === 0 && (
                  <div className="absolute inset-0 bg-gray-900 bg-opacity-75 rounded-lg flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">Код истек</span>
                  </div>
                )}
              </div>
            </div>

            {/* Инструкция */}
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              <p className="font-medium mb-2">Пошаговая инструкция:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Нажмите синюю кнопку "Открыть @{authCode.botUsername}"</li>
                <li>Скопируйте код выше</li>
                <li>Отправьте код боту в личном сообщении</li>
                <li>Бот пришлет ссылку для входа</li>
              </ol>
            </div>
          </div>
        </details>
      </div>
    </Card>
  )
}

