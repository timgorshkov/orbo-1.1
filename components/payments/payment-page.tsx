'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreditCard, QrCode, Building2, CheckCircle2, XCircle, Clock, Loader2, ArrowLeft, Copy, Check } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────

type PaymentFor = 'event' | 'membership'
type GatewayCode = 'manual' | 'yookassa' | 'tbank' | 'sbp'
type SessionStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'

interface GatewayInfo {
  code: GatewayCode
  label: string
  icon: 'card' | 'qr' | 'bank' | 'other'
}

interface PaymentSession {
  id: string
  status: SessionStatus
  amount: number
  currency: string
  payment_for: PaymentFor
  gateway_code: GatewayCode
  payment_url: string | null
  payment_reference: string | null
  paid_at: string | null
  error_message: string | null
}

interface PaymentPageProps {
  orgId: string
  orgName: string
  paymentFor: PaymentFor
  amount: number
  currency: string
  description: string
  /** For event payments */
  eventId?: string
  eventRegistrationId?: string
  /** For membership payments */
  membershipPaymentId?: string
  /** Participant ID */
  participantId?: string
  /** User ID (if logged in) */
  userId?: string
  /** URL to return to after payment */
  returnPath: string
  /** Bank details for manual transfer */
  bankDetails?: {
    bankName: string
    bik: string
    correspondentAccount: string
    settlementAccount: string
    recipientName: string
  } | null
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br'
}

// ─── Component ──────────────────────────────────────────────────────

export default function PaymentPage({
  orgId,
  orgName,
  paymentFor,
  amount,
  currency,
  description,
  eventId,
  eventRegistrationId,
  membershipPaymentId,
  participantId,
  userId,
  returnPath,
  bankDetails,
}: PaymentPageProps) {
  const [gateways, setGateways] = useState<GatewayInfo[]>([])
  const [selectedGateway, setSelectedGateway] = useState<GatewayCode | null>(null)
  const [session, setSession] = useState<PaymentSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [gatewaysLoading, setGatewaysLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency
  const isTerminal = session && ['succeeded', 'failed', 'cancelled', 'refunded'].includes(session.status)

  // Load available gateways
  useEffect(() => {
    fetch('/api/pay/gateways')
      .then(res => res.json())
      .then(data => {
        setGateways(data.gateways || [])
        // Auto-select first card gateway if available
        const cardGw = (data.gateways || []).find((g: GatewayInfo) => g.icon === 'card')
        if (cardGw) setSelectedGateway(cardGw.code)
      })
      .catch(() => setError('Не удалось загрузить способы оплаты'))
      .finally(() => setGatewaysLoading(false))
  }, [])

  // Poll session status
  useEffect(() => {
    if (!session || isTerminal) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pay/status/${session.id}`)
        const data = await res.json()
        if (data.status !== session.status) {
          setSession(prev => prev ? { ...prev, ...data } : null)
        }
      } catch {
        // ignore polling errors
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [session, isTerminal])

  // Initiate payment
  const handlePay = useCallback(async () => {
    if (!selectedGateway) return

    setLoading(true)
    setError(null)

    try {
      const returnUrl = `${window.location.origin}/p/${orgId}/pay?sessionId=`

      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          paymentFor,
          amount,
          currency,
          description,
          gatewayCode: selectedGateway,
          returnUrl,
          eventId: eventId || undefined,
          eventRegistrationId: eventRegistrationId || undefined,
          membershipPaymentId: membershipPaymentId || undefined,
          participantId: participantId || undefined,
          createdBy: userId || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при создании платежа')
      }

      setSession(data.session)

      // For card gateways — redirect to payment page
      if (data.redirectUrl && selectedGateway !== 'manual') {
        window.location.href = data.redirectUrl
        return
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedGateway, orgId, paymentFor, amount, currency, description, eventId, eventRegistrationId, membershipPaymentId, participantId, userId])

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  // ─── Payment Success ─────────────────────────────────────────────
  if (session?.status === 'succeeded') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Оплата прошла успешно!</h2>
            <p className="text-sm text-gray-600">
              {amount.toLocaleString('ru-RU')} {currencySymbol} — {description}
            </p>
            <Button onClick={() => window.location.href = returnPath} className="mt-4">
              Вернуться
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Payment Failed ───────────────────────────────────────────────
  if (session?.status === 'failed' || session?.status === 'cancelled') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">
              {session.status === 'cancelled' ? 'Оплата отменена' : 'Ошибка оплаты'}
            </h2>
            <p className="text-sm text-gray-600">
              {session.error_message || 'Попробуйте ещё раз или выберите другой способ оплаты'}
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setSession(null); setError(null) }} className="flex-1">
                Попробовать снова
              </Button>
              <Button variant="outline" onClick={() => window.location.href = returnPath} className="flex-1">
                Вернуться
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Bank Transfer Instructions (after session created) ───────────
  if (session && selectedGateway === 'manual') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Банковский перевод</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                К оплате: <span className="font-bold text-lg">{amount.toLocaleString('ru-RU')} {currencySymbol}</span>
              </p>
            </div>

            {/* Payment reference */}
            {session.payment_reference && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800 font-medium mb-1">
                  Укажите в назначении платежа:
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-lg font-mono font-bold text-amber-900">
                    {session.payment_reference}
                  </code>
                  <button
                    onClick={() => copyToClipboard(session.payment_reference!, 'ref')}
                    className="p-1 text-amber-600 hover:text-amber-800"
                  >
                    {copied === 'ref' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  Это нужно для автоматической сверки платежа
                </p>
              </div>
            )}

            {/* Bank details */}
            {bankDetails && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-800">Реквизиты для перевода:</p>
                {[
                  { label: 'Получатель', value: bankDetails.recipientName },
                  { label: 'Банк', value: bankDetails.bankName },
                  { label: 'БИК', value: bankDetails.bik, key: 'bik' },
                  { label: 'К/с', value: bankDetails.correspondentAccount, key: 'corr' },
                  { label: 'Р/с', value: bankDetails.settlementAccount, key: 'acc' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-2 text-sm">
                    <span className="text-gray-500 shrink-0">{item.label}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-900 font-mono text-right">{item.value}</span>
                      {item.key && (
                        <button
                          onClick={() => copyToClipboard(item.value, item.key!)}
                          className="p-0.5 text-gray-400 hover:text-gray-600"
                        >
                          {copied === item.key ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Clock className="w-4 h-4 text-gray-500" />
              <p className="text-sm text-gray-600">
                После перевода оплата будет подтверждена администратором в течение 1–2 рабочих дней.
              </p>
            </div>

            <Button variant="outline" onClick={() => window.location.href = returnPath} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Вернуться
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Processing (waiting for gateway) ─────────────────────────────
  if (session && session.status === 'processing') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <Loader2 className="w-12 h-12 text-blue-500 mx-auto animate-spin" />
            <h2 className="text-lg font-semibold text-gray-900">Ожидаем подтверждение оплаты</h2>
            <p className="text-sm text-gray-600">
              {amount.toLocaleString('ru-RU')} {currencySymbol} — {description}
            </p>
            <p className="text-xs text-gray-400">
              Проверяем статус каждые 3 секунды...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Gateway Selection ────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="text-center">
        <p className="text-sm text-gray-500 mb-1">{orgName}</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Оплата</h1>
        <p className="text-gray-600">{description}</p>
      </div>

      {/* Amount */}
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-gray-500 mb-1">К оплате</p>
          <p className="text-4xl font-bold text-gray-900">
            {amount.toLocaleString('ru-RU')} <span className="text-2xl text-gray-500">{currencySymbol}</span>
          </p>
        </CardContent>
      </Card>

      {/* Gateway selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Способ оплаты</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {gatewaysLoading ? (
            <div className="py-4 text-center text-gray-500 text-sm">Загрузка...</div>
          ) : gateways.length === 0 ? (
            <div className="py-4 text-center text-gray-500 text-sm">Нет доступных способов оплаты</div>
          ) : (
            gateways.map(gw => (
              <button
                key={gw.code}
                type="button"
                onClick={() => setSelectedGateway(gw.code)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left ${
                  selectedGateway === gw.code
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedGateway === gw.code ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  {gw.icon === 'card' && <CreditCard className={`w-5 h-5 ${selectedGateway === gw.code ? 'text-blue-600' : 'text-gray-600'}`} />}
                  {gw.icon === 'qr' && <QrCode className={`w-5 h-5 ${selectedGateway === gw.code ? 'text-blue-600' : 'text-gray-600'}`} />}
                  {gw.icon === 'bank' && <Building2 className={`w-5 h-5 ${selectedGateway === gw.code ? 'text-blue-600' : 'text-gray-600'}`} />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${selectedGateway === gw.code ? 'text-blue-900' : 'text-gray-900'}`}>
                    {gw.label}
                  </p>
                  {gw.code === 'manual' && (
                    <p className="text-xs text-gray-500">Подтверждение в течение 1–2 рабочих дней</p>
                  )}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Pay button */}
      <Button
        onClick={handlePay}
        disabled={!selectedGateway || loading}
        className="w-full h-12 text-base"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Создание платежа...
          </span>
        ) : (
          `Оплатить ${amount.toLocaleString('ru-RU')} ${currencySymbol}`
        )}
      </Button>

      {/* Back link */}
      <button
        onClick={() => window.location.href = returnPath}
        className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
      >
        Вернуться назад
      </button>
    </div>
  )
}
