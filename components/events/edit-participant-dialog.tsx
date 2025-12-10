'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface EditParticipantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  orgId: string
  registrationId: string
  initialData: {
    full_name: string
    email: string | null
    phone: string | null
    bio: string | null
    payment_status?: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded' | null
  }
  hasPayment: boolean
  onSuccess: () => void
}

export default function EditParticipantDialog({
  open,
  onOpenChange,
  eventId,
  orgId,
  registrationId,
  initialData,
  hasPayment,
  onSuccess
}: EditParticipantDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    full_name: initialData.full_name || '',
    email: initialData.email || '',
    phone: initialData.phone || '',
    bio: initialData.bio || '',
    payment_status: initialData.payment_status || null
  })

  // Update form data when initialData changes
  useEffect(() => {
    if (open && initialData) {
      setFormData({
        full_name: initialData.full_name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        bio: initialData.bio || '',
        payment_status: initialData.payment_status || null
      })
    }
  }, [open, initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!formData.full_name.trim()) {
        throw new Error('Имя участника обязательно')
      }

      const response = await fetch(`/api/events/${eventId}/participants/${registrationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: orgId,
          full_name: formData.full_name.trim(),
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          bio: formData.bio.trim() || null,
          // Note: payment_status is no longer editable here - use Payments tab instead
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при обновлении регистрации')
      }

      // Сброс формы и закрытие диалога
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      console.error('Error updating registration:', err)
      setError(err.message || 'Произошла неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Редактировать регистрацию</DialogTitle>
          <DialogDescription>
            Обновите данные участника в событии
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">
              ФИО <span className="text-red-500">*</span>
            </Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="Иван Иванов"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="ivan@example.com"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+7 (999) 123-45-67"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Кратко о себе</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Дополнительная информация об участнике"
              rows={3}
              disabled={loading}
            />
          </div>

          {hasPayment && formData.payment_status && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-600">
              <span className="font-medium">Статус оплаты:</span>{' '}
              {{
                pending: 'Ожидается',
                paid: 'Оплачено',
                partially_paid: 'Частично оплачено',
                overdue: 'Просрочено',
                cancelled: 'Отменено',
                refunded: 'Возврат'
              }[formData.payment_status] || formData.payment_status}
              <p className="text-xs text-neutral-500 mt-1">
                Для изменения статуса оплаты используйте вкладку "Оплаты"
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <AlertDescription>{error}</AlertDescription>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null)
                onOpenChange(false)
              }}
              disabled={loading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить изменения'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

