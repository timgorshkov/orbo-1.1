'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, AlertTriangle, User, Calendar, MapPin, CreditCard, Clock, ShieldCheck, Loader2 } from 'lucide-react'

interface CheckinData {
  registration: {
    id: string
    status: string
    payment_status: string | null
    paid_amount: number
    price: number
    quantity: number
    registered_at: string
    checked_in_at: string | null
    is_already_checked_in: boolean
  }
  event: {
    id: string
    title: string
    event_date: string | null
    start_time: string | null
    end_time: string | null
    location_info: string | null
    org_id: string
    event_type: string
    requires_payment: boolean
  } | null
  participant: {
    id: string
    full_name: string | null
    username: string | null
    photo_url: string | null
    email: string | null
    phone: string | null
  } | null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU', { 
    day: 'numeric', month: 'long', year: 'numeric' 
  })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  return timeStr.substring(0, 5)
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

export default function CheckinPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    }>
      <CheckinPage />
    </Suspense>
  )
}

function CheckinPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [data, setData] = useState<CheckinData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [checkInResult, setCheckInResult] = useState<{
    success: boolean
    already_checked_in: boolean
    checked_in_at: string
    message: string
  } | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Отсутствует токен билета')
      setLoading(false)
      return
    }

    fetch(`/api/events/checkin?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Билет не найден')
        }
        return res.json()
      })
      .then((result) => {
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [token])

  const handleConfirmCheckin = async () => {
    if (!token) return
    setConfirming(true)

    try {
      const res = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Ошибка при check-in')
      }

      setCheckInResult(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600">Проверяем билет...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Билет не найден</h1>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { registration, event, participant } = data
  const isPaid = registration.payment_status === 'paid'
  const isPaymentRequired = event?.requires_payment
  const isAlreadyCheckedIn = registration.is_already_checked_in || checkInResult?.already_checked_in

  // Success state after check-in
  if (checkInResult?.success && !checkInResult.already_checked_in) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-green-800 mb-2">Добро пожаловать!</h1>
          <p className="text-lg font-medium text-gray-900 mb-1">
            {participant?.full_name || 'Участник'}
          </p>
          {event && (
            <p className="text-sm text-gray-500 mb-4">{event.title}</p>
          )}
          <div className="text-xs text-gray-400">
            Отмечен в {formatDateTime(checkInResult.checked_in_at)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full overflow-hidden">
        {/* Header */}
        <div className={`p-6 text-center ${isAlreadyCheckedIn ? 'bg-amber-50' : 'bg-blue-50'}`}>
          {/* Participant Photo */}
          <div className="w-24 h-24 rounded-full bg-white shadow-md overflow-hidden mx-auto mb-3">
            {participant?.photo_url ? (
              <img
                src={participant.photo_url}
                alt={participant.full_name || ''}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <User className="h-12 w-12 text-gray-400" />
              </div>
            )}
          </div>

          {/* Name */}
          <h1 className="text-xl font-bold text-gray-900">
            {participant?.full_name || 'Участник'}
          </h1>
          {participant?.username && (
            <p className="text-sm text-gray-500">@{participant.username}</p>
          )}
        </div>

        {/* Event Info */}
        <div className="px-6 py-4 border-b border-gray-100">
          {event && (
            <div className="space-y-2">
              <h2 className="font-semibold text-gray-900 text-sm">{event.title}</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formatDate(event.event_date)}</span>
                {event.start_time && (
                  <span>{formatTime(event.start_time)}–{formatTime(event.end_time)}</span>
                )}
              </div>
              {event.location_info && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{event.location_info}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status badges */}
        <div className="px-6 py-4 space-y-3">
          {/* Registration info */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Регистрация</span>
            <span className="text-xs text-gray-700">
              {formatDateTime(registration.registered_at)}
              {registration.quantity > 1 && ` × ${registration.quantity}`}
            </span>
          </div>

          {/* Payment status */}
          {isPaymentRequired && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" />
                Оплата
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                isPaid 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {isPaid 
                  ? `Оплачено ${Math.round(registration.paid_amount).toLocaleString('ru-RU')} ₽` 
                  : `Не оплачено (${Math.round(registration.price).toLocaleString('ru-RU')} ₽)`}
              </span>
            </div>
          )}

          {/* Already checked in warning */}
          {isAlreadyCheckedIn && (
            <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-2 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <div>
                <div className="font-medium">Уже прошёл</div>
                <div className="text-xs text-amber-600">
                  {registration.checked_in_at 
                    ? `Отмечен в ${formatDateTime(registration.checked_in_at)}`
                    : checkInResult?.checked_in_at
                    ? `Отмечен в ${formatDateTime(checkInResult.checked_in_at)}`
                    : 'Повторный проход по этому билету'}
                </div>
              </div>
            </div>
          )}

          {/* Not paid warning */}
          {isPaymentRequired && !isPaid && !isAlreadyCheckedIn && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <div className="font-medium">Оплата не подтверждена</div>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="px-6 pb-6">
          {!isAlreadyCheckedIn && (
            <button
              onClick={handleConfirmCheckin}
              disabled={confirming}
              className="w-full py-4 rounded-xl font-semibold text-white text-lg transition-all active:scale-[0.98] disabled:opacity-50 bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2"
            >
              {confirming ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Отмечаем...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5" />
                  Подтвердить проход
                </>
              )}
            </button>
          )}

          {isAlreadyCheckedIn && (
            <div className="text-center text-sm text-gray-500 py-2">
              <Clock className="h-4 w-4 inline mr-1" />
              Повторный check-in не требуется
            </div>
          )}

          {error && (
            <div className="mt-3 text-center text-sm text-red-600">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
