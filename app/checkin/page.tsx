'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  CheckCircle2, XCircle, AlertTriangle, User, Calendar, MapPin,
  CreditCard, Clock, ShieldCheck, Loader2, Keyboard, ArrowLeft
} from 'lucide-react'

const QrScanner = dynamic(() => import('@/components/checkin/qr-scanner'), { ssr: false })

interface RegistratorSession {
  sessionId: string
  orgId: string
  name: string
  orgName: string
}

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
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <CheckinPage />
    </Suspense>
  )
}

function CheckinPage() {
  const searchParams = useSearchParams()
  const tokenFromUrl = searchParams.get('token')

  // Registrator session (or null if admin / not authenticated)
  const [registrator, setRegistrator] = useState<RegistratorSession | null>(null)
  const [registratorLoaded, setRegistratorLoaded] = useState(false)

  // Active token (URL or scanned)
  const [activeToken, setActiveToken] = useState<string | null>(tokenFromUrl)

  // Manual code entry
  const [manualCode, setManualCode] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSubmitting, setManualSubmitting] = useState(false)

  // Ticket state
  const [data, setData] = useState<CheckinData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [checkInResult, setCheckInResult] = useState<{
    success: boolean
    already_checked_in: boolean
    checked_in_at: string
    message: string
  } | null>(null)

  // Load registrator session info on mount (if any)
  useEffect(() => {
    fetch('/api/registrator/me')
      .then(res => res.json())
      .then(data => setRegistrator(data.session || null))
      .catch(() => setRegistrator(null))
      .finally(() => setRegistratorLoaded(true))
  }, [])

  // Fetch ticket whenever activeToken changes
  useEffect(() => {
    if (!activeToken) {
      setData(null)
      setError(null)
      setCheckInResult(null)
      return
    }

    setLoading(true)
    setError(null)
    setCheckInResult(null)

    fetch(`/api/events/checkin?token=${encodeURIComponent(activeToken)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Билет не найден')
        }
        return res.json()
      })
      .then((result) => setData(result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeToken])

  const handleScanned = useCallback((token: string) => {
    setActiveToken(token)
    // Update URL without full reload so refresh keeps state
    const next = new URL(window.location.href)
    next.searchParams.set('token', token)
    window.history.replaceState({}, '', next.toString())
  }, [])

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = manualCode.replace(/\s|-/g, '').toUpperCase()
    if (code.length !== 8) {
      setManualError('Введите 8 символов кода')
      return
    }

    setManualSubmitting(true)
    setManualError(null)
    try {
      const res = await fetch('/api/events/checkin-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setManualError(data.error || 'Билет не найден')
        return
      }
      handleScanned(data.token)
      setManualCode('')
    } catch {
      setManualError('Ошибка сети')
    } finally {
      setManualSubmitting(false)
    }
  }

  const handleConfirmCheckin = async () => {
    if (!activeToken) return
    setConfirming(true)

    try {
      const res = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: activeToken })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Ошибка при check-in')
      setCheckInResult(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  const handleScanAnother = () => {
    setActiveToken(null)
    setData(null)
    setError(null)
    setCheckInResult(null)
    setManualCode('')
    const next = new URL(window.location.href)
    next.searchParams.delete('token')
    window.history.replaceState({}, '', next.toString())
  }

  // ─── No registrator session — show invite instruction ──────
  if (registratorLoaded && !registrator && !activeToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center">
          <div className="text-4xl mb-3">🎫</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Сканер билетов</h1>
          <p className="text-sm text-gray-600 mb-4">
            Чтобы начать проверку билетов, откройте ссылку-приглашение от организатора мероприятия.
          </p>
          <p className="text-xs text-gray-400">
            Если у вас нет ссылки — попросите её у организатора.
          </p>
        </div>
      </div>
    )
  }

  // ─── Top header with registrator name ──────────────────────
  const TopBar = registrator ? (
    <div className="bg-white border-b border-gray-100 px-4 py-2 sticky top-0 z-10">
      <div className="max-w-md mx-auto flex items-center justify-between text-xs text-gray-500">
        <span className="truncate">
          <span className="text-gray-400">Регистратор:</span> <span className="text-gray-700 font-medium">{registrator.name}</span>
        </span>
        <span className="text-gray-400 ml-3 truncate">{registrator.orgName}</span>
      </div>
    </div>
  ) : null

  // ─── Scanner mode — no token loaded yet ────────────────────
  if (!activeToken) {
    return (
      <div className="min-h-screen bg-gray-50">
        {TopBar}
        <div className="max-w-md mx-auto p-4">
          <div className="text-center mb-4 mt-2">
            <h1 className="text-xl font-bold text-gray-900">Сканер билетов</h1>
            <p className="text-sm text-gray-500 mt-1">Наведите камеру на QR участника</p>
          </div>

          <QrScanner onToken={handleScanned} />

          {/* Quick instructions */}
          <div className="mt-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-2 text-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Подсказки</p>
            <ol className="space-y-1.5 text-gray-600">
              <li className="flex gap-2"><span className="text-gray-400">1.</span> Нажмите «Запустить сканер» и наведите камеру на QR-код участника.</li>
              <li className="flex gap-2"><span className="text-gray-400">2.</span> Если сканер не запускается — откройте QR обычным приложением камеры на телефоне: оно само распознает код и предложит ссылку, перейдите по ней.</li>
              <li className="flex gap-2"><span className="text-gray-400">3.</span> Если QR совсем не читается — введите 8 символов кода с билета вручную (под QR указан код вида <span className="font-mono text-gray-800">ABCD-1234</span>).</li>
            </ol>
          </div>

          {/* Manual code entry */}
          <form onSubmit={handleManualSubmit} className="mt-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Keyboard className="w-4 h-4" />
              Ввести код вручную
            </label>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="ABCD-1234"
              maxLength={9}
              autoCapitalize="characters"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-center tracking-widest text-base uppercase focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {manualError && (
              <p className="text-xs text-red-600">{manualError}</p>
            )}
            <button
              type="submit"
              disabled={manualSubmitting || manualCode.replace(/\s|-/g, '').length !== 8}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {manualSubmitting ? 'Поиск…' : 'Найти билет'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Loading ticket ────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {TopBar}
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-gray-600">Проверяем билет…</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Error state ───────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50">
        {TopBar}
        <div className="flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Билет не найден</h1>
            <p className="text-gray-600 text-sm mb-6">{error}</p>
            <button
              onClick={handleScanAnother}
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <ArrowLeft className="w-4 h-4" /> Сканировать другой билет
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { registration, event, participant } = data
  const isPaid = registration.payment_status === 'paid'
  const isPaymentRequired = event?.requires_payment
  const isAlreadyCheckedIn = registration.is_already_checked_in || checkInResult?.already_checked_in

  // ─── Success after check-in ────────────────────────────────
  if (checkInResult?.success && !checkInResult.already_checked_in) {
    return (
      <div className="min-h-screen bg-green-50">
        {TopBar}
        <div className="flex items-center justify-center p-4">
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
            <div className="text-xs text-gray-400 mb-6">
              Отмечен в {formatDateTime(checkInResult.checked_in_at)}
            </div>
            <button
              onClick={handleScanAnother}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
            >
              Сканировать следующий
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Ticket details + confirm button ───────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {TopBar}
      <div className="flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full overflow-hidden">
          {/* Header */}
          <div className={`p-6 text-center ${isAlreadyCheckedIn ? 'bg-amber-50' : 'bg-blue-50'}`}>
            <div className="w-24 h-24 rounded-full bg-white shadow-md overflow-hidden mx-auto mb-3">
              {participant?.photo_url ? (
                <img src={participant.photo_url} alt={participant.full_name || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <User className="h-12 w-12 text-gray-400" />
                </div>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {participant?.full_name || 'Участник'}
            </h1>
            {participant?.username && (
              <p className="text-sm text-gray-500">@{participant.username}</p>
            )}
          </div>

          {/* Event info */}
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

          {/* Status */}
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Регистрация</span>
              <span className="text-xs text-gray-700">
                {formatDateTime(registration.registered_at)}
                {registration.quantity > 1 && ` × ${registration.quantity}`}
              </span>
            </div>

            {isPaymentRequired && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  Оплата
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {isPaid
                    ? `Оплачено ${Math.round(registration.paid_amount).toLocaleString('ru-RU')} ₽`
                    : `Не оплачено (${Math.round(registration.price).toLocaleString('ru-RU')} ₽)`}
                </span>
              </div>
            )}

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

            {isPaymentRequired && !isPaid && !isAlreadyCheckedIn && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <div className="font-medium">Оплата не подтверждена</div>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="px-6 pb-6 space-y-3">
            {!isAlreadyCheckedIn && (
              <button
                onClick={handleConfirmCheckin}
                disabled={confirming}
                className="w-full py-4 rounded-xl font-semibold text-white text-lg transition-all active:scale-[0.98] disabled:opacity-50 bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2"
              >
                {confirming ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Отмечаем…</>
                ) : (
                  <><ShieldCheck className="h-5 w-5" /> Подтвердить проход</>
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
              <div className="text-center text-sm text-red-600">{error}</div>
            )}

            <button
              onClick={handleScanAnother}
              className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              ← Сканировать другой билет
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
