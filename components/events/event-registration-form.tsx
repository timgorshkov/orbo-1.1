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
  username?: string | null
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
  paymentLink?: string | null
  paymentInstructions?: string | null
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
  paymentLink,
  paymentInstructions,
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
  // Step 1: registration fields, Step 2: payment (only for paid events)
  const [step, setStep] = useState<1 | 2>(1)

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
      setStep(1)
    }
  }, [open])

  const handleFieldChange = (fieldKey: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldKey]: value
    }))
  }

  // Validate fields and proceed to next step or submit
  const handleStep1Submit = (e: React.FormEvent) => {
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

    // If paid event - go to step 2
    if (requiresPayment) {
      setStep(2)
      return
    }

    // Otherwise - submit directly
    submitRegistration()
  }

  // Submit registration (called from step 1 for free events, or from step 2)
  const submitRegistration = (confirmPayment: boolean = false) => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/events/${eventId}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registration_data: formData,
            quantity: quantity,
            // If user confirms payment, mark as pending confirmation
            payment_confirmed: confirmPayment
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

  // Format currency symbol
  const currencySymbols: Record<string, string> = {
    RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br'
  }
  const currencySymbol = currencySymbols[currency] || currency

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
          <DialogTitle>
            {step === 1 ? 'Регистрация на событие' : 'Оплата регистрации'}
          </DialogTitle>
          <DialogDescription>
            {eventTitle}
            {requiresPayment && step === 1 && (
              <span className="text-neutral-500"> • Шаг 1 из 2</span>
            )}
            {requiresPayment && step === 2 && (
              <span className="text-neutral-500"> • Шаг 2 из 2</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Fixed min-height to prevent layout shift during loading */}
        <div className="min-h-[200px]">
          {loading ? (
            <div className="py-8 text-center text-neutral-500">
              Загрузка формы...
            </div>
          ) : step === 1 ? (
            // STEP 1: Registration fields
            <form onSubmit={handleStep1Submit} className="space-y-6">
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
                      Итого к оплате: <span className="font-semibold">{totalPrice} {currencySymbol}</span>
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
              ) : (
                // Show user info when no registration fields are configured
                <div className="p-4 bg-neutral-50 rounded-lg text-center">
                  <p className="text-sm text-neutral-600 mb-2">Вы регистрируетесь как:</p>
                  <p className="font-medium text-neutral-900">
                    {participantProfile?.full_name || participantProfile?.username || 'Участник'}
                  </p>
                </div>
              )}

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
                  {requiresPayment ? 'Далее →' : (isPending ? 'Регистрация...' : 'Зарегистрироваться')}
                </Button>
              </div>
            </form>
          ) : (
            // STEP 2: Payment (only for paid events)
            <div className="space-y-6">
              {/* Price summary */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  К оплате: <span className="font-bold text-lg">{totalPrice} {currencySymbol}</span>
                  {quantity > 1 && ` (${quantity} билета)`}
                </p>
              </div>

              {/* Payment link button */}
              {paymentLink && (
                <div className="text-center">
                  <a
                    href={paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  >
                    💳 Перейти к оплате
                  </a>
                  <p className="text-xs text-neutral-500 mt-2">
                    Откроется страница оплаты в новом окне
                  </p>
                </div>
              )}

              {/* Payment instructions */}
              {paymentInstructions && (
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <p className="text-sm font-medium text-neutral-700 mb-2">Инструкции по оплате:</p>
                  <p className="text-sm text-neutral-600 whitespace-pre-wrap">{paymentInstructions}</p>
                </div>
              )}

              {/* No payment info */}
              {!paymentLink && !paymentInstructions && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  Свяжитесь с организатором для получения информации об оплате.
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 pt-4">
                <Button
                  onClick={() => submitRegistration(true)}
                  disabled={isPending}
                  className="w-full"
                >
                  {isPending ? 'Регистрация...' : '✓ Подтвердить оплату'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => submitRegistration(false)}
                  disabled={isPending}
                  className="w-full"
                >
                  Пропустить (оплачу позже)
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStep(1)}
                  disabled={isPending}
                  className="w-full text-neutral-500"
                >
                  ← Назад
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

