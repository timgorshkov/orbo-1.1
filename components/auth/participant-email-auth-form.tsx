'use client'

import { useState } from 'react'
import { Mail, Loader2, Check, AlertCircle } from 'lucide-react'

interface Props {
  orgId: string
}

export default function ParticipantEmailAuthForm({ orgId }: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    setError(null)

    try {
      const res = await fetch('/api/participant-auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), orgId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Ошибка отправки')
        setStatus('error')
        return
      }

      setStatus('sent')
    } catch {
      setError('Не удалось подключиться к серверу')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Check className="w-6 h-6 text-green-600" />
        </div>
        <p className="font-medium text-gray-900 mb-1">Письмо отправлено!</p>
        <p className="text-sm text-gray-500">
          Проверьте <span className="font-medium">{email}</span> — там будет ссылка для входа.
        </p>
        <p className="text-xs text-gray-400 mt-2">Ссылка действительна 30 минут</p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-4 text-xs text-blue-600 hover:underline"
        >
          Отправить снова
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading' || !email.trim()}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
      >
        {status === 'loading' ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Отправка...</>
        ) : (
          'Получить ссылку для входа'
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Мы отправим вам одноразовую ссылку для входа
      </p>
    </form>
  )
}
