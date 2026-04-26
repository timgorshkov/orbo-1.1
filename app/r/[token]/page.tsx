'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ExternalLink, Loader2 } from 'lucide-react'

interface InviteInfo {
  orgId: string
  orgName: string
  isActive: boolean
  existingSession: { name: string; orgName: string } | null
}

export default function RegistratorInvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/registrator/invite-info?token=${encodeURIComponent(String(token))}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Ссылка недействительна')
        }
        return res.json()
      })
      .then((data: InviteInfo) => {
        if (!data.isActive) {
          setLoadError('Ссылка деактивирована организатором')
        } else {
          setInfo(data)
        }
      })
      .catch((err) => setLoadError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoadingInfo(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/registrator/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error || 'Не удалось активировать')
        return
      }

      setSubmitted(true)
      setTimeout(() => router.push('/checkin'), 1200)
    } catch {
      setSubmitError('Ошибка сети')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Loading invite info ───────────────────────────────────
  if (loadingInfo) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
        <p className="text-sm text-gray-500">Загрузка…</p>
      </Centered>
    )
  }

  if (loadError) {
    return (
      <Centered>
        <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Ссылка не работает</h1>
          <p className="text-sm text-gray-600">{loadError}</p>
          <p className="text-xs text-gray-400 mt-4">
            Запросите новую ссылку у организатора мероприятия.
          </p>
        </div>
      </Centered>
    )
  }

  if (!info) return null

  // ─── Existing session — skip name entry ────────────────────
  if (info.existingSession) {
    return (
      <Centered>
        <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-8 text-center">
          {/* Org name on top */}
          <p className="text-xs text-gray-400 mb-4">{info.orgName}</p>

          <div className="text-4xl mb-3">👋</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">
            С возвращением, {info.existingSession.name}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Сессия регистратора уже активна
          </p>

          <button
            onClick={() => router.push('/checkin')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Перейти к сканеру
          </button>
        </div>
      </Centered>
    )
  }

  // ─── Submitted state ───────────────────────────────────────
  if (submitted) {
    return (
      <Centered>
        <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-8 text-center">
          <p className="text-xs text-gray-400 mb-4">{info.orgName}</p>
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Готово!</h1>
          <p className="text-sm text-gray-500">Перенаправляем на сканер…</p>
        </div>
      </Centered>
    )
  }

  // ─── Name entry form ───────────────────────────────────────
  return (
    <Centered>
      <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-8">
        {/* Org name on top, small */}
        <p className="text-xs text-gray-400 text-center mb-5">{info.orgName}</p>

        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🎫</div>
          <h1 className="text-xl font-bold text-gray-900">Регистратор на мероприятии</h1>
          <p className="text-sm text-gray-500 mt-2">
            Представьтесь, чтобы начать работу
          </p>
        </div>

        {/* Recommend opening in regular browser if inside in-app webview */}
        <InAppBrowserHint />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ваше имя
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
              required
              autoFocus
              disabled={submitting}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            />
          </div>

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Подключение…' : 'Начать работу'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Вы получите доступ к сканированию QR-кодов участников. Для проверки билетов
          никакая регистрация в Orbo не требуется.
        </p>
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      {children}
    </div>
  )
}

/**
 * Detect common in-app browsers (Telegram WebView, MAX, etc.) and recommend
 * opening the link in the system browser. Camera-app QR scans always open in
 * the system browser, so cookies set inside an in-app WebView won't be there.
 */
function InAppBrowserHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent || ''
    // Telegram Android WebView injects "Telegram" in UA on some builds; iOS often doesn't
    // Use a broad heuristic plus the Telegram WebApp object check
    const inTelegram = /Telegram/i.test(ua) || (typeof window !== 'undefined' && !!(window as any).TelegramWebviewProxy)
    const inMax = /MaxApp/i.test(ua)
    const inFB = /FBAN|FBAV|Instagram/i.test(ua)
    setShow(inTelegram || inMax || inFB)
  }, [])

  if (!show) return null

  return (
    <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
      <ExternalLink className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>
        <div className="font-medium mb-0.5">Откройте в обычном браузере</div>
        <div className="leading-relaxed">
          Иначе вы не сможете подтверждать билеты, отсканированные с камеры.
          Меню «⋮» (или поделиться) → «Открыть в Chrome / Safari».
        </div>
      </div>
    </div>
  )
}
