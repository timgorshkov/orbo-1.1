'use client'

import { useState, useEffect, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

interface RegistrationField {
  id: string
  event_id: string
  field_key: string
  field_label: string
  field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox'
  required: boolean
  field_order: number
  participant_field_mapping: string | null
  options?: { options?: string[] } | null
}

interface ParticipantProfile {
  full_name?: string | null
  email?: string | null
  phone?: string | null
  bio?: string | null
}

interface EventRegistrationFormProps {
  eventId: string
  eventTitle: string
  requiresPayment?: boolean
  defaultPrice?: number | null
  currency?: string
  allowMultipleTickets?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  participantProfile?: ParticipantProfile | null
}

export default function EventRegistrationForm({
  eventId,
  eventTitle,
  requiresPayment = false,
  defaultPrice,
  currency = 'RUB',
  allowMultipleTickets = false,
  open,
  onOpenChange,
  onSuccess,
  participantProfile
}: EventRegistrationFormProps) {
  const [fields, setFields] = useState<RegistrationField[]>([])
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Load registration fields
  useEffect(() => {
    if (!open) return

    setLoading(true)
    setError(null)
    
    fetch(`/api/events/${eventId}/registration-fields`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
          return
        }
        
        const loadedFields = (data.fields || []) as RegistrationField[]
        setFields(loadedFields.sort((a, b) => a.field_order - b.field_order))
        
        // Pre-fill form data from participant profile
        const prefillData: Record<string, any> = {}
        
        loadedFields.forEach(field => {
          if (field.participant_field_mapping && participantProfile) {
            switch (field.participant_field_mapping) {
              case 'full_name':
                if (participantProfile.full_name) {
                  prefillData[field.field_key] = participantProfile.full_name
                }
                break
              case 'email':
                if (participantProfile.email) {
                  prefillData[field.field_key] = participantProfile.email
                }
                break
              case 'phone_number':
              case 'phone':
                if (participantProfile.phone) {
                  prefillData[field.field_key] = participantProfile.phone
                }
                break
              case 'bio':
                if (participantProfile.bio) {
                  prefillData[field.field_key] = participantProfile.bio
                }
                break
            }
          }
        })
        
        setFormData(prefillData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading registration fields:', err)
        setError('Не удалось загрузить форму регистрации')
        setLoading(false)
      })
  }, [eventId, open, participantProfile])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setFormData({})
      setQuantity(1)
      setError(null)
    }
  }, [open])

  const handleFieldChange = (fieldKey: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldKey]: value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    const missingFields = fields
      .filter(field => field.required && !formData[field.field_key])
      .map(field => field.field_label)

    if (missingFields.length > 0) {
      setError(`Заполните обязательные поля: ${missingFields.join(', ')}`)
      return
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/events/${eventId}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registration_data: formData,
            quantity: quantity
          })
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось зарегистрироваться')
        }

        // Success!
        onSuccess()
        onOpenChange(false)
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  const renderField = (field: RegistrationField) => {
    const value = formData[field.field_key] || ''
    const commonProps = {
      id: field.field_key,
      value: value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        handleFieldChange(field.field_key, e.target.value)
      },
      required: field.required,
      placeholder: field.required ? `${field.field_label} *` : field.field_label
    }

    switch (field.field_type) {
      case 'textarea':
        return (
          <Textarea
            {...commonProps}
            value={value}
            onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
            className="min-h-[100px]"
          />
        )

      case 'select':
        const options = field.options?.options || []
        return (
          <Select
            value={value}
            onValueChange={(val) => handleFieldChange(field.field_key, val)}
            required={field.required}
          >
            <SelectContent>
              {options.map((option, idx) => (
                <SelectItem key={idx} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={field.field_key}
              checked={!!value}
              onChange={(e) => handleFieldChange(field.field_key, e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor={field.field_key} className="text-sm">
              {field.field_label}
            </label>
          </div>
        )

      case 'email':
        return (
          <Input
            {...commonProps}
            type="email"
          />
        )

      case 'phone':
        return (
          <Input
            {...commonProps}
            type="tel"
          />
        )

      default: // text
        return (
          <Input
            {...commonProps}
            type="text"
          />
        )
    }
  }

  // Calculate total price
  const totalPrice = requiresPayment && defaultPrice
    ? (defaultPrice * quantity).toLocaleString('ru-RU')
    : null

  return (
    <Dialog 
      open={open} 
      onOpenChange={onOpenChange}
      onInteractOutside={(e) => {
        // Prevent closing on outside click - only close via Cancel button or Esc
        e.preventDefault()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Регистрация на событие</DialogTitle>
          <DialogDescription>
            {eventTitle}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-neutral-500">
            Загрузка формы...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Quantity selector (for multiple tickets) */}
            {requiresPayment && allowMultipleTickets && (
              <div>
                <Label htmlFor="quantity">Количество билетов</Label>
                <Select
                  value={quantity.toString()}
                  onValueChange={(val) => setQuantity(parseInt(val))}
                >
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(num => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? 'билет' : num < 5 ? 'билета' : 'билетов'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {totalPrice && (
                  <p className="text-sm text-neutral-600 mt-2">
                    Итого к оплате: <span className="font-semibold">{totalPrice} {currency}</span>
                  </p>
                )}
              </div>
            )}

            {/* Registration fields */}
            {fields.length > 0 ? (
              <div className="space-y-4">
                {fields.map(field => (
                  <div key={field.id}>
                    <Label htmlFor={field.field_key}>
                      {field.field_label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {renderField(field)}
                  </div>
                ))}
              </div>
            ) : null}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="flex-1"
              >
                {isPending ? 'Регистрация...' : 'Зарегистрироваться'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

