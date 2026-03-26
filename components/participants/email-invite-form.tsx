'use client'

import { useState } from 'react'
import { Send, Loader2, Check, AlertCircle, X } from 'lucide-react'

interface EmailInvite {
  id: string
  email: string
  status: string
  personal_note: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

interface Props {
  orgId: string
  initialInvites?: EmailInvite[]
}

export default function EmailInviteForm({ orgId, initialInvites = [] }: Props) {
  const [invites, setInvites] = useState<EmailInvite[]>(initialInvites)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    setError(null)

    try {
      const res = await fetch(`/api/organizations/${orgId}/participant-invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), personalNote: note.trim() || undefined }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ошибка отправки')
        setStatus('error')
        return
      }

      setInvites(prev => [data.invite, ...prev.filter(i => i.email !== data.invite.email)])
      setEmail('')
      setNote('')
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setError('Не удалось подключиться к серверу')
      setStatus('error')
    }
  }

  const handleCancel = async (inviteId: string) => {
    try {
      await fetch(`/api/organizations/${orgId}/participant-invites`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })
      setInvites(prev => prev.map(i => i.id === inviteId ? { ...i, status: 'cancelled' } : i))
    } catch {
      // ignore
    }
  }

  const pendingInvites = invites.filter(i => i.status === 'pending')
  const recentAccepted = invites.filter(i => i.status === 'accepted').slice(0, 5)

  return (
    <div className="space-y-4">
      {/* Send form */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@example.com"
          required
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Заметка (необяз.)"
          className="hidden sm:block w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={status === 'loading' || !email.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          {status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === 'success' ? (
            <><Check className="w-4 h-4" /> Отправлено</>
          ) : (
            <><Send className="w-4 h-4" /> Пригласить</>
          )}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Ожидают ответа ({pendingInvites.length})</p>
          <div className="space-y-1">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between gap-2 py-1.5 px-3 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-700 truncate">{invite.email}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    до {new Date(invite.expires_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={() => handleCancel(invite.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Отменить"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently accepted */}
      {recentAccepted.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Приняли приглашение</p>
          <div className="space-y-1">
            {recentAccepted.map(invite => (
              <div key={invite.id} className="flex items-center gap-2 py-1.5 px-3 bg-green-50 rounded-lg text-sm">
                <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span className="text-gray-700 truncate">{invite.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
