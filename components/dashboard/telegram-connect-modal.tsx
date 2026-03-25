'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, CheckCircle2, Copy, Check } from 'lucide-react'
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
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollCount = useRef(0)

  useEffect(() => {
    if (hasTelegramAccount) return
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) return

    // Generate code immediately so it's ready when modal appears
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

  const handleConnectClick = () => {
    if (code && pollStatus === 'idle') startPolling(code)
  }

  const handleCopyCode = () => {
    if (!code) return
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    if (pollStatus === 'idle') startPolling(code)
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
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleConnectClick}
            className={`flex items-center justify-center gap-2 w-full h-11 rounded-xl font-semibold text-white transition-colors ${
              !code ? 'bg-blue-300 cursor-wait' : 'bg-[#2AABEE] hover:bg-[#229ED9]'
            }`}
          >
            <Send className="w-4 h-4" />
            {pollStatus === 'waiting' ? 'Ожидаем подтверждение…' : 'Подключить Telegram'}
          </a>
        )}

        {pollStatus !== 'connected' && code && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500 mb-2">
              Если кнопка не открывает Telegram — откройте{' '}
              <span className="font-medium text-gray-700">@{botUsername}</span> вручную и отправьте код:
            </p>
            <div className="flex items-center gap-2">
              <span className="flex-1 font-mono text-xl font-bold tracking-widest text-gray-900 select-all text-center">
                {code}
              </span>
              <button
                onClick={handleCopyCode}
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                aria-label="Скопировать код"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {pollStatus !== 'connected' && (
          <button
            onClick={dismiss}
            className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Пропустить
          </button>
        )}
      </div>
    </div>
  )
}
