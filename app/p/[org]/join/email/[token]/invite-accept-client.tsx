'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, AlertCircle } from 'lucide-react'

interface Org {
  id: string
  name: string
  logo_url?: string | null
  portal_cover_url?: string | null
  public_description?: string | null
}

interface Props {
  orgId: string
  token: string
  email: string
  org: Org
}

export default function InviteAcceptClient({ orgId, token, email, org }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleAccept = async () => {
    setStatus('loading')
    setError(null)

    try {
      const res = await fetch(`/api/participant-invite/${token}`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ошибка при принятии приглашения')
        setStatus('error')
        return
      }

      setStatus('success')
      setTimeout(() => router.push(`/p/${orgId}`), 1500)
    } catch {
      setError('Не удалось подключиться к серверу')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          {/* Cover */}
          {org.portal_cover_url ? (
            <img
              src={org.portal_cover_url}
              alt={org.name}
              className="w-full h-36 object-cover"
            />
          ) : (
            <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-600" />
          )}

          <div className="p-8">
            {/* Logo + Org name */}
            {org.logo_url && (
              <img
                src={org.logo_url}
                alt={org.name}
                className="w-14 h-14 rounded-xl object-cover border border-gray-200 mb-4"
              />
            )}
            <h1 className="text-xl font-bold text-gray-900 mb-1">{org.name}</h1>
            {org.public_description && (
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">{org.public_description}</p>
            )}

            {status === 'success' ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-green-600" />
                </div>
                <p className="text-lg font-semibold text-gray-900 mb-1">Добро пожаловать!</p>
                <p className="text-sm text-gray-500">Переходим в сообщество...</p>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-6">
                  <p className="text-sm text-gray-700">
                    Вас приглашают в сообщество как участника.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Приглашение для: <span className="font-medium">{email}</span>
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleAccept}
                  disabled={status === 'loading'}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {status === 'loading' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Принятие...</>
                  ) : (
                    'Принять приглашение'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
