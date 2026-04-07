'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'

interface Props {
  sessionId: string
  orgId: string
  returnPath: string
}

export default function PaymentReturnHandler({ sessionId, orgId, returnPath }: Props) {
  const [status, setStatus] = useState<string>('loading')
  const [amount, setAmount] = useState<number>(0)
  const [currency, setCurrency] = useState<string>('RUB')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    let attempts = 0
    const maxAttempts = 40 // ~2 minutes at 3s intervals

    const poll = async () => {
      try {
        const res = await fetch(`/api/pay/status/${sessionId}`)
        const data = await res.json()

        setAmount(data.amount || 0)
        setCurrency(data.currency || 'RUB')

        if (['succeeded', 'failed', 'cancelled', 'refunded'].includes(data.status)) {
          setStatus(data.status)
          setErrorMessage(data.error_message)
          if (interval) clearInterval(interval)
          return
        }

        setStatus(data.status)
        attempts++
        if (attempts >= maxAttempts) {
          setStatus('timeout')
          if (interval) clearInterval(interval)
        }
      } catch {
        // keep polling
      }
    }

    poll()
    interval = setInterval(poll, 3000)

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [sessionId])

  const currencySymbols: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br' }
  const sym = currencySymbols[currency] || currency

  if (status === 'loading' || status === 'pending' || status === 'processing') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <Loader2 className="w-12 h-12 text-blue-500 mx-auto animate-spin" />
            <h2 className="text-lg font-semibold text-gray-900">Проверяем статус оплаты</h2>
            <p className="text-xs text-gray-400">Проверяем каждые 3 секунды...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'succeeded') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Оплата прошла успешно!</h2>
            {amount > 0 && (
              <p className="text-sm text-gray-600">
                {amount.toLocaleString('ru-RU')} {sym}
              </p>
            )}
            <Button onClick={() => window.location.href = returnPath} className="mt-4">
              Вернуться
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'timeout') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <Clock className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900">Оплата обрабатывается</h2>
            <p className="text-sm text-gray-600">
              Статус оплаты ещё не подтверждён. Это может занять некоторое время.
            </p>
            <Button onClick={() => window.location.href = returnPath} className="mt-4">
              Вернуться
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // failed / cancelled / refunded
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-6 space-y-4">
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">
            {status === 'cancelled' ? 'Оплата отменена' : 'Ошибка оплаты'}
          </h2>
          <p className="text-sm text-gray-600">
            {errorMessage || 'Попробуйте ещё раз или свяжитесь с организатором'}
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => {
              // Remove sessionId from URL and reload
              window.location.href = window.location.pathname + window.location.search.replace(/[?&]sessionId=[^&]+/, '')
            }} className="flex-1">
              Попробовать снова
            </Button>
            <Button onClick={() => window.location.href = returnPath} className="flex-1">
              Вернуться
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
