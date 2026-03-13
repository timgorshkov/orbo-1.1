'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Crown, X, Search } from 'lucide-react'

interface Plan {
  id: string
  name: string
  price: number | null
  billing_period: string
}

interface Participant {
  id: string
  full_name: string | null
  username: string | null
  photo_url: string | null
}

interface GrantMembershipDialogProps {
  orgId: string
  plans: Plan[]
  onClose: () => void
  onSuccess: () => void
  preselectedParticipantId?: string
}

export function GrantMembershipDialog({ orgId, plans, onClose, onSuccess, preselectedParticipantId }: GrantMembershipDialogProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id || '')
  const [participantId, setParticipantId] = useState(preselectedParticipantId || '')
  const [basis, setBasis] = useState<string>('manual')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null)

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setParticipants([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/participants?orgId=${orgId}&search=${encodeURIComponent(searchQuery)}&limit=10`)
        if (res.ok) {
          const data = await res.json()
          setParticipants(data.participants || [])
        }
      } catch {} finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, orgId])

  const handleGrant = async () => {
    const pid = participantId || selectedParticipant?.id
    if (!pid || !selectedPlanId) {
      setError('Выберите участника и план')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/participant-memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          participantId: pid,
          planId: selectedPlanId,
          basis,
          expiresAt: expiresAt || undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      onSuccess()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const PERIOD_LABELS: Record<string, string> = {
    one_time: 'разовый', weekly: 'нед.', monthly: 'мес.',
    quarterly: 'квартал', semi_annual: 'полугодие', annual: 'год', custom: 'свой',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Выдать членство</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!preselectedParticipantId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Участник</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSelectedParticipant(null)
                  }}
                  placeholder="Поиск по имени..."
                  className="pl-9"
                />
              </div>
              {selectedParticipant && (
                <div className="mt-1 text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded">
                  {selectedParticipant.full_name || selectedParticipant.username}
                </div>
              )}
              {!selectedParticipant && participants.length > 0 && (
                <div className="mt-1 border rounded-lg max-h-40 overflow-auto">
                  {participants.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedParticipant(p); setParticipantId(p.id); setParticipants([]) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                          {(p.full_name || p.username || '?')[0]}
                        </div>
                      )}
                      <span>{p.full_name || p.username || p.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">План</label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.price ? `— ${p.price} ₽/${PERIOD_LABELS[p.billing_period] || p.billing_period}` : '(бесплатный)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Основание</label>
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="manual">Вручную</option>
              <option value="payment">Оплата</option>
              <option value="invitation">Приглашение</option>
              <option value="moderation">Модерация</option>
              <option value="promotion">Промо-акция</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Действует до (необязательно)</label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Заметка</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Необязательно"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={handleGrant} disabled={loading}>
            {loading ? 'Выдаём...' : 'Выдать членство'}
          </Button>
        </div>
      </div>
    </div>
  )
}
