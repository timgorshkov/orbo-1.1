'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X, Check } from 'lucide-react'

interface AddAdminDialogProps {
  organizationId: string
  onAdminAdded?: () => void
}

export function AddAdminDialog({ organizationId, onAdminAdded }: AddAdminDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !email.includes('@')) {
      setError('Введите корректный email')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/organizations/${organizationId}/team/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось добавить администратора')
      }

      setSuccess(true)
      setEmail('')
      
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        onAdminAdded?.()
      }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} className="mr-2" />
        Добавить администратора
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold">Добавить администратора</h3>
          <button
            onClick={() => {
              setOpen(false)
              setError(null)
              setEmail('')
            }}
            className="p-1 hover:bg-neutral-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-2">
              Email администратора
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              placeholder="admin@example.com"
              required
              disabled={loading}
            />
            <p className="text-xs text-neutral-500 mt-2">
              Если пользователь уже зарегистрирован, он сразу получит права администратора.
              Иначе будет отправлено приглашение на email.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
              <Check size={16} />
              Администратор успешно добавлен!
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                setError(null)
                setEmail('')
              }}
              disabled={loading}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !email} 
              className="flex-1"
            >
              {loading ? 'Добавление...' : 'Добавить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

