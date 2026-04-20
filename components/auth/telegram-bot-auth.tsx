'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

export default function TelegramBotAuth({
  orgId,
  eventId,
  redirectUrl,
  onSuccess,
}: TelegramBotAuthProps) {
  const [authCode, setAuthCode] = useState<AuthCodeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'polling' | 'linked' | 'redirecting'>('idle')
  const [showSlowHint, setShowSlowHint] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Генерация кода при монтировании
  useEffect(() => {
    generateCode()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    }
  }, [orgId, eventId])

  // Таймер обратного отсчёта
  useEffect(() => {
    if (!authCode) return
    const expiresAt = new Date(authCode.expiresAt).getTime()
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) {
        clearInterval(interval)
        stopPolling()
        setError('Код истек. Нажмите «Получить новый код».')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [authCode])

  const generateCode = async () => {
    try {
      setLoading(true)
      setError(null)
      setShowSlowHint(false)
      setReportSent(false)
      setPollingStatus('idle')
      stopPolling()

      const res = await fetch('/api/auth/telegram-code/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventId, redirectUrl }),
      })
      if (!res.ok) throw new Error('Не удалось сгенерировать код')
      const data = await res.json()
      setAuthCode(data)
      setTimeLeft(data.expiresInSeconds)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  // ─── Polling ──────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollingRef.current || !authCode) return
    setPollingStatus('polling')
    setShowSlowHint(false)

    // Через 10 секунд показать подсказку «Бот не ответил?»
    slowTimerRef.current = setTimeout(() => {
      setShowSlowHint(true)
    }, 30_000)

    pollingRef.current = setInterval(async () => {
      if (!authCode) return
      try {
        const res = await fetch(
          `/api/auth/telegram-code/status?code=${encodeURIComponent(authCode.code)}`
        )
        if (!res.ok) return
        const data = await res.json()

        if (data.linked) {
          stopPolling()
          setPollingStatus('linked')
          setShowSlowHint(false)

          // Автоматический redirect — пользователю не нужно кликать ссылку в боте
          setPollingStatus('redirecting')
          const appUrl = window.location.origin
          const redir = redirectUrl || '/orgs'
          const fullRedirect = redir.startsWith('http') ? redir : `${appUrl}${redir}`
          window.location.href = `/auth/telegram-handler?code=${encodeURIComponent(
            authCode.code
          )}&redirect=${encodeURIComponent(fullRedirect)}`

          if (onSuccess) onSuccess()
        }
      } catch {
        // Тихо — сеть может моргать
      }
    }, 3000)
  }, [authCode, redirectUrl, onSuccess])

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current)
      slowTimerRef.current = null
    }
  }

  // Автостарт polling после генерации кода
  useEffect(() => {
    if (authCode && timeLeft > 0) {
      startPolling()
    }
    return () => stopPolling()
  }, [authCode, startPolling])

  // ─── «Дайте нам сигнал» ───────────────────────────────────────────

  const handleReportIssue = async () => {
    if (reportSent || !authCode) return
    setReportSent(true)
    try {
      await fetch('/api/auth/telegram-code/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: authCode.code,
          orgId,
          eventId,
          userAgent: navigator.userAgent,
        }),
      })
    } catch {
      // best-effort
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600">Генерация кода...</span>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <Button onClick={generateCode} variant="outline">
            Получить новый код
          </Button>
        </div>
      </Card>
    )
  }

  if (!authCode) return null

  if (pollingStatus === 'redirecting' || pollingStatus === 'linked') {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          <span className="text-green-700 font-medium">Код принят, выполняется вход...</span>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="text-center">
        {/* ШАГ 1: Открыть бота */}
        <div className="mb-4">
          <p className="text-sm text-gray-700 mb-3 font-medium">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-1.5">1</span>
            Откройте бота в Telegram:
          </p>
          <a
            href={authCode.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white py-5 sm:py-6 text-base sm:text-lg">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.717-.962 3.928-1.36 5.214-.168.543-.5.725-.819.743-.695.03-1.223-.46-1.895-.9-1.054-.69-1.648-1.12-2.671-1.795-1.182-.78-.416-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212-.07-.062-.174-.041-.248-.024-.106.024-1.793 1.14-5.062 3.345-.479.331-.913.492-1.302.484-.428-.01-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.324-.437.892-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.001.321.023.465.14.121.099.155.232.171.325.016.094.036.308.02.475z" />
              </svg>
              Открыть @{authCode.botUsername}
            </Button>
          </a>
        </div>

        {/* ШАГ 2: Скопировать и отправить код */}
        <div className="mb-4">
          <p className="text-sm text-gray-700 mb-3 font-medium">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-1.5">2</span>
            Скопируйте код и отправьте его боту:
          </p>
          <div
            className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 sm:p-6 font-mono text-2xl sm:text-3xl font-bold text-blue-600 select-all text-center cursor-pointer hover:border-blue-400 transition-colors"
            onClick={() => {
              navigator.clipboard?.writeText(authCode.code).catch(() => {})
            }}
          >
            {authCode.code}
          </div>
          <p className="text-xs text-gray-500 mt-1.5 text-center">
            Нажмите на код, чтобы скопировать, и отправьте его боту в личном сообщении
          </p>
        </div>

        {/* Таймер */}
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-4">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Код действителен: </span>
          <span className={`font-mono font-semibold ${timeLeft < 60 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatTime(timeLeft)}
          </span>
          {pollingStatus === 'polling' && (
            <span className="inline-flex items-center gap-1 text-xs text-blue-600">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              ожидаем ответ бота
            </span>
          )}
        </div>

        {timeLeft < 60 && timeLeft > 0 && (
          <p className="text-xs text-red-600 mb-4 text-center">Код скоро истечет!</p>
        )}

        {timeLeft === 0 && (
          <div className="mb-4">
            <Button onClick={generateCode} variant="outline" size="sm" className="w-full">
              Получить новый код
            </Button>
          </div>
        )}

        {/* Подсказка «Бот не ответил?» — через 10 секунд */}
        {showSlowHint && pollingStatus === 'polling' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
            <p className="text-sm text-amber-800 font-medium mb-1">Бот не ответил?</p>
            <p className="text-xs text-amber-700 mb-2">
              Иногда Telegram задерживает доставку сообщений. Если код не работает,
              попробуйте получить новый или войти другим способом (email, Google, Яндекс).
            </p>
            {!reportSent ? (
              <button
                onClick={handleReportIssue}
                className="text-xs font-medium text-amber-800 underline hover:text-amber-900"
              >
                Сообщить о проблеме
              </button>
            ) : (
              <span className="text-xs text-green-700">Спасибо, мы получили сигнал и разберёмся.</span>
            )}
          </div>
        )}

        {/* Подробная инструкция — свёрнута */}
        <details className="mt-4 text-left">
          <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800 font-medium text-center">
            Показать QR-код и подробную инструкцию
          </summary>
          <div className="mt-4 space-y-4">
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
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              <p className="font-medium mb-2">Пошаговая инструкция:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Нажмите синюю кнопку «Открыть @{authCode.botUsername}»</li>
                <li>Скопируйте код и отправьте его боту в личном сообщении</li>
                <li>Дождитесь автоматического входа — или нажмите на ссылку в ответе бота</li>
              </ol>
            </div>
          </div>
        </details>
      </div>
    </Card>
  )
}
