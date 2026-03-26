'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, CheckCircle2, Copy, Check, ExternalLink } from 'lucide-react'
import { ymGoal } from '@/components/analytics/YandexMetrika'

const STORAGE_KEY = 'orbo_tg_modal_shown'
const SHOW_DELAY_MS = 1500
const POLL_INTERVAL_MS = 2500
const MAX_POLL_ATTEMPTS = 72 // 3 minutes

interface TelegramConnectModalProps {
  hasTelegramAccount: boolean
}

export function TelegramConnectModal({ hasTelegramAccount }: TelegramConnectModalProps) {
  const [visible, setVisible] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [botUsername, setBotUsername] = useState(
    process.env.NEXT_PUBLIC_TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot'
  )
  const [pollStatus, setPollStatus] = useState<'idle' | 'waiting' | 'connected'>('idle')
  const [copied, setCopied] = useState(false)
  const [botCopied, setBotCopied] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollCount = useRef(0)

  useEffect(() => {
    if (hasTelegramAccount) return
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) return

    fetch('/api/auth/telegram-code/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(data => {
        if (data.code) setCode(data.code)
        if (data.botUsername) setBotUsername(data.botUsername)
      })
      .catch(() => {})

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [hasTelegramAccount])

  // Start polling as soon as code is available
  useEffect(() => {
    if (code && visible && pollStatus === 'idle') {
      startPolling(code)
    }
  }, [code, visible])

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [])

  const dismiss = () => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    if (pollTimer.current) clearTimeout(pollTimer.current)
    ymGoal('tg_modal_dismissed')
  }

  const startPolling = (codeValue: string) => {
    setPollStatus('waiting')
    pollCount.current = 0

    const tick = async () => {
      pollCount.current++
      if (pollCount.current > MAX_POLL_ATTEMPTS) return

      try {
        const res = await fetch(`/api/auth/telegram-code/status?code=${codeValue}`)
        if (res.ok) {
          const data = await res.json()
          if (data.linked) {
            setPollStatus('connected')
            ymGoal('telegram_account_connected', undefined, { once: true })
            if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1')
            setTimeout(() => setVisible(false), 2000)
            return
          }
        }
      } catch { /* retry next tick */ }

      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS)
    }

    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS)
  }

  const handleCopyCode = () => {
    if (!code) return
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!visible) return null

  const deepLink = code
    ? `https://t.me/${botUsername}?start=${code}`
    : `https://t.me/${botUsername}`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
          <Send className="w-6 h-6 text-blue-600" />
        </div>

        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Подключите Telegram
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Получайте уведомления об активности в группах и новых участниках прямо в Telegram.
        </p>

        {pollStatus === 'connected' ? (
          <div className="flex items-center gap-2 text-green-600 font-medium text-sm py-2">
            <CheckCircle2 className="w-5 h-5" />
            Telegram подключён!
          </div>
        ) : (
          <>
            {/* Instruction */}
            <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-600 mb-2">
              <span>Откройте</span>
              <span className="font-semibold text-gray-900">@{botUsername}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(`@${botUsername}`).catch(() => {}); setBotCopied(true); setTimeout(() => setBotCopied(false), 2000) }}
                className="inline-flex items-center p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Скопировать имя бота"
              >
                {botCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <span>в Telegram и отправьте этот код:</span>
            </div>

            {/* Primary: code block */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-4">
              {code ? (
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-blue-700 select-all text-center">
                    {code}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 hover:border-blue-400 text-blue-600 text-sm font-medium transition-colors"
                  >
                    {copied ? (
                      <><Check className="w-4 h-4 text-green-500" /><span className="hidden sm:inline text-green-600">Скопировано</span></>
                    ) : (
                      <><Copy className="w-4 h-4" /><span className="hidden sm:inline">Копировать</span></>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center text-sm text-blue-400 py-1">Генерация кода...</div>
              )}
            </div>

            {/* Polling status */}
            {pollStatus === 'waiting' && (
              <p className="text-xs text-gray-400 text-center mb-3">
                Ожидаем подтверждение от бота...
              </p>
            )}

            {/* Secondary: t.me link */}
            {code && (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-500 hover:text-blue-600 text-xs font-medium transition-colors mb-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Открыть бота в один клик
              </a>
            )}
            {code && (
              <p className="text-xs text-gray-400 text-center mb-3">
                Может не работать при блокировках
              </p>
            )}
          </>
        )}

        {pollStatus !== 'connected' && (
          <button
            onClick={dismiss}
            className="mt-1 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Пропустить
          </button>
        )}
      </div>
    </div>
  )
}
