'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import TelegramMarkdownEditor from './telegram-markdown-editor'
import CoverImageUpload from './cover-image-upload'

// Field status for registration form configuration
type FieldStatus = 'disabled' | 'optional' | 'required'

type FieldConfig = {
  status: FieldStatus
  label?: string // Custom label (mainly for bio field)
}

type RegistrationFieldsConfig = {
  full_name?: FieldConfig
  phone_number?: FieldConfig
  email?: FieldConfig
  bio?: FieldConfig
}

type Event = {
  id?: string
  title: string
  description: string | null
  cover_image_url: string | null
  event_type: 'online' | 'offline'
  location_info: string | null
  map_link?: string | null // Link to map for offline events
  event_date: string
  end_date?: string | null
  start_time: string
  end_time: string
  is_paid: boolean
  price_info: string | null
  // New payment fields
  requires_payment?: boolean
  default_price?: number | null
  currency?: string
  payment_deadline_days?: number | null
  payment_instructions?: string | null
  payment_link?: string | null
  allow_multiple_tickets?: boolean
  // Registration fields config (JSONB)
  registration_fields_config?: RegistrationFieldsConfig | null
  capacity: number | null
  status: 'draft' | 'published' | 'cancelled'
  is_public: boolean
  telegram_group_link: string | null
}

type Props = {
  orgId: string
  mode: 'create' | 'edit'
  initialEvent?: Event
}

export default function EventForm({ orgId, mode, initialEvent }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const [title, setTitle] = useState(initialEvent?.title || '')
  const [description, setDescription] = useState(initialEvent?.description || '')
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(initialEvent?.cover_image_url || null)
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null)
  const [eventType, setEventType] = useState<'online' | 'offline'>(initialEvent?.event_type || 'online')
  const [locationInfo, setLocationInfo] = useState(initialEvent?.location_info || '')
  const [mapLink, setMapLink] = useState(initialEvent?.map_link || '')
  
  // Helper to format date for input (handles ISO format)
  const formatDateForInput = (dateStr: string | Date | null | undefined): string => {
    if (!dateStr) return ''
    
    // If it's a Date object, convert to ISO string first
    if (dateStr instanceof Date) {
      return dateStr.toISOString().split('T')[0]
    }
    
    // If it's not a string, try to convert it
    if (typeof dateStr !== 'string') {
      try {
        // Handle potential object with date-like structure
        const dateObj = new Date(dateStr as any)
        if (!isNaN(dateObj.getTime())) {
          return dateObj.toISOString().split('T')[0]
        }
      } catch {
        // Ignore conversion errors
      }
      return ''
    }
    
    // If it's already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
    
    // Otherwise, extract just the date part
    return dateStr.split('T')[0]
  }
  
  const [eventDate, setEventDate] = useState(formatDateForInput(initialEvent?.event_date))
  const [endDate, setEndDate] = useState(formatDateForInput(initialEvent?.end_date) || formatDateForInput(initialEvent?.event_date))
  
  // Helper to format time for input (handles HH:MM:SS format)
  const formatTimeForInput = (timeStr: string | Date | null | undefined): string => {
    if (!timeStr) return ''
    
    // If it's a Date object, extract time
    if (timeStr instanceof Date) {
      return timeStr.toTimeString().substring(0, 5)
    }
    
    // If it's not a string, try to convert
    if (typeof timeStr !== 'string') {
      const converted = String(timeStr)
      if (converted && converted.length >= 5) {
        return converted.substring(0, 5)
      }
      return ''
    }
    
    // Return first 5 characters (HH:MM)
    return timeStr.substring(0, 5)
  }
  
  const [startTime, setStartTime] = useState(formatTimeForInput(initialEvent?.start_time))
  const [endTime, setEndTime] = useState(formatTimeForInput(initialEvent?.end_time))
  
  // Payment fields (new)
  const [requiresPayment, setRequiresPayment] = useState(
    initialEvent?.requires_payment ?? initialEvent?.is_paid ?? false
  )
  const [defaultPrice, setDefaultPrice] = useState<string>(
    initialEvent?.default_price?.toString() || ''
  )
  const [currency, setCurrency] = useState(initialEvent?.currency || 'RUB')
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState<string>(
    initialEvent?.payment_deadline_days?.toString() || '3'
  )
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialEvent?.payment_instructions || ''
  )
  const [paymentLink, setPaymentLink] = useState(
    initialEvent?.payment_link || ''
  )
  const [allowMultipleTickets, setAllowMultipleTickets] = useState(
    initialEvent?.allow_multiple_tickets ?? false
  )
  
  // Registration fields configuration
  const defaultFieldsConfig: RegistrationFieldsConfig = {
    full_name: { status: 'disabled' },
    phone_number: { status: 'disabled' },
    email: { status: 'disabled' },
    bio: { status: 'disabled', label: 'Кратко о себе' }
  }
  
  const [requestContactInfo, setRequestContactInfo] = useState(() => {
    // Check if any field is enabled in initial config
    const config = initialEvent?.registration_fields_config
    if (!config) return false
    return Object.values(config).some(f => f?.status !== 'disabled')
  })
  
  const [fieldsConfig, setFieldsConfig] = useState<RegistrationFieldsConfig>(() => {
    const config = initialEvent?.registration_fields_config
    if (config) {
      return {
        full_name: config.full_name || defaultFieldsConfig.full_name,
        phone_number: config.phone_number || defaultFieldsConfig.phone_number,
        email: config.email || defaultFieldsConfig.email,
        bio: config.bio || defaultFieldsConfig.bio
      }
    }
    return defaultFieldsConfig
  })
  
  // Old payment fields (for backward compatibility)
  const [isPaid, setIsPaid] = useState(initialEvent?.is_paid || false)
  const [priceInfo, setPriceInfo] = useState(initialEvent?.price_info || '')
  
  const [capacity, setCapacity] = useState<string>(initialEvent?.capacity?.toString() || '')
  const [status, setStatus] = useState<'draft' | 'published' | 'cancelled'>(
    initialEvent?.status || 'published'
  )
  const [isPublic, setIsPublic] = useState(initialEvent?.is_public ?? true) // Public by default for new events
  const [telegramGroupLink, setTelegramGroupLink] = useState(initialEvent?.telegram_group_link || '')
  
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Validation with specific error messages
    const missingFields: string[] = []
    if (!title) missingFields.push('Название')
    if (!eventDate) missingFields.push('Дата начала')
    if (!startTime) missingFields.push('Время начала')
    if (!endTime) missingFields.push('Время окончания')
    
    if (missingFields.length > 0) {
      setError(`Пожалуйста, заполните обязательные поля: ${missingFields.join(', ')}`)
      return
    }

    // Validate date range
    if (endDate && endDate < eventDate) {
      setError('Дата окончания не может быть раньше даты начала')
      return
    }

    // Validate time range
    // If end_date is same as event_date, end_time must be after start_time
    // If end_date is after event_date, end_time can be any time
    const effectiveEndDate = endDate || eventDate
    if (effectiveEndDate === eventDate && startTime >= endTime) {
      setError('Время окончания должно быть позже времени начала')
      return
    }

    // Don't send blob: URLs to the server - they're invalid
    const actualCoverUrl = coverImageUrl?.startsWith('blob:') ? null : coverImageUrl
    
    const eventData = {
      orgId,
      title,
      description,
      coverImageUrl: actualCoverUrl,
      eventType,
      locationInfo: locationInfo || null,
      mapLink: eventType === 'offline' && mapLink ? mapLink : null,
      eventDate,
      endDate: endDate && endDate !== eventDate ? endDate : null,
      startTime,
      endTime,
      // New payment fields
      requiresPayment,
      defaultPrice: requiresPayment && defaultPrice ? parseFloat(defaultPrice) : null,
      currency: requiresPayment ? currency : null,
      paymentDeadlineDays: requiresPayment && paymentDeadlineDays ? parseInt(paymentDeadlineDays) : null,
      paymentInstructions: requiresPayment && paymentInstructions ? paymentInstructions : null,
      paymentLink: requiresPayment && paymentLink ? paymentLink : null,
      allowMultipleTickets: allowMultipleTickets,
      // Registration fields config - only send if contact info is requested
      registrationFieldsConfig: requestContactInfo ? fieldsConfig : null,
      capacity: capacity ? parseInt(capacity) : null,
      status,
      isPublic,
      telegramGroupLink: telegramGroupLink || null
    }

    startTransition(async () => {
      try {
        const url = mode === 'create' 
          ? '/api/events'
          : `/api/events/${initialEvent?.id}`
        
        const method = mode === 'create' ? 'POST' : 'PUT'

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData)
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Произошла ошибка')
        }

        const createdEventId = data.event.id

        // If there's a pending cover file, upload it now
        if (pendingCoverFile && mode === 'create') {
          try {
            const formData = new FormData()
            formData.append('file', pendingCoverFile)
            
            const uploadResponse = await fetch(`/api/events/${createdEventId}/cover`, {
              method: 'POST',
              body: formData,
            })
            
            if (!uploadResponse.ok) {
              console.error('Failed to upload cover image')
            }
          } catch (uploadErr) {
            console.error('Error uploading cover:', uploadErr)
          }
        }

        setSuccess(true)
        
        // Redirect to event detail page
        setTimeout(() => {
          router.push(`/p/${orgId}/events/${createdEventId}`)
        }, 1000)
      } catch (err: any) {
        setError(err.message || 'Произошла ошибка при сохранении')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Основная информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Название события <span className="text-red-500">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Введите название события"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Описание
                </label>
                <TelegramMarkdownEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Расскажите о событии, программе, спикерах..."
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Обложка события
                </label>
                <CoverImageUpload
                  value={coverImageUrl}
                  onChange={(url) => setCoverImageUrl(url)}
                  onFileSelect={(file) => setPendingCoverFile(file)}
                  eventId={initialEvent?.id}
                  orgId={orgId}
                  disabled={isPending}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Дата и время</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Дата начала <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="date"
                    value={eventDate}
                    onChange={(e) => {
                      setEventDate(e.target.value)
                      // If end_date is not set or same as old event_date, update it too
                      if (!endDate || endDate === eventDate) {
                        setEndDate(e.target.value)
                      }
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Дата окончания (опционально)
                  </label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={eventDate}
                    placeholder="Оставьте пустым для однодневного события"
                  />
                  {endDate && endDate === eventDate && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Событие в один день
                    </p>
                  )}
                  {endDate && endDate > eventDate && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Многодневное событие
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Время начала <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Время окончания <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Место проведения</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Тип события
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="online"
                      checked={eventType === 'online'}
                      onChange={(e) => setEventType(e.target.value as 'online' | 'offline')}
                      className="mr-2"
                    />
                    Онлайн
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="offline"
                      checked={eventType === 'offline'}
                      onChange={(e) => setEventType(e.target.value as 'online' | 'offline')}
                      className="mr-2"
                    />
                    Офлайн
                  </label>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  {eventType === 'online' ? 'Ссылка на трансляцию' : 'Адрес'}
                </label>
                <Input
                  type={eventType === 'online' ? 'url' : 'text'}
                  value={locationInfo}
                  onChange={(e) => setLocationInfo(e.target.value)}
                  placeholder={eventType === 'online' ? 'https://zoom.us/...' : 'Москва, ул. Примерная, д. 1'}
                />
              </div>

              {/* Map Link for Offline Events */}
              {eventType === 'offline' && (
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Ссылка на карту (необязательно)
                  </label>
                  <Input
                    type="url"
                    value={mapLink}
                    onChange={(e) => setMapLink(e.target.value)}
                    placeholder="https://yandex.ru/maps/... или https://maps.google.com/..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Ссылка на Яндекс.Карты, Google Maps или 2GIS
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Стоимость и оплата</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requiresPayment"
                  checked={requiresPayment}
                  onChange={(e) => setRequiresPayment(e.target.checked)}
                  className="mr-2 h-4 w-4"
                />
                <label htmlFor="requiresPayment" className="text-sm font-medium">
                  Платное событие
                </label>
              </div>

              {requiresPayment && (
                <div className="space-y-4 pt-2 border-t border-neutral-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Цена по умолчанию <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={defaultPrice}
                        onChange={(e) => setDefaultPrice(e.target.value)}
                        placeholder="1000"
                        required={requiresPayment}
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        Можно изменить для каждого участника отдельно
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Валюта
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full p-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="RUB">RUB (₽)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="KZT">KZT (₸)</option>
                        <option value="BYN">BYN (Br)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Крайний срок оплаты (дней до события)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={paymentDeadlineDays}
                      onChange={(e) => setPaymentDeadlineDays(e.target.value)}
                      placeholder="3"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Участники должны оплатить за N дней до события
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Платёжная ссылка
                    </label>
                    <Input
                      type="url"
                      value={paymentLink}
                      onChange={(e) => setPaymentLink(e.target.value)}
                      placeholder="https://pay.example.com/..."
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Ссылка на страницу оплаты в банке или платёжной системе. Участники смогут перейти по ней для оплаты.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Инструкции по оплате
                    </label>
                    <textarea
                      value={paymentInstructions}
                      onChange={(e) => setPaymentInstructions(e.target.value)}
                      placeholder="Реквизиты для оплаты, номер карты, дополнительные указания..."
                      className="w-full min-h-[100px] p-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Дополнительные инструкции, которые увидят участники
                    </p>
                  </div>

                  <div className="flex items-center pt-2 border-t border-neutral-200">
                    <input
                      type="checkbox"
                      id="allowMultipleTickets"
                      checked={allowMultipleTickets}
                      onChange={(e) => setAllowMultipleTickets(e.target.checked)}
                      className="mr-2 h-4 w-4"
                    />
                    <label htmlFor="allowMultipleTickets" className="text-sm font-medium">
                      Разрешить регистрацию нескольких билетов
                    </label>
                  </div>
                  <p className="text-xs text-neutral-500 -mt-2">
                    Участники смогут зарегистрировать несколько билетов (до 5) в одной регистрации
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registration Fields Card */}
          <Card>
            <CardHeader>
              <CardTitle>Поля регистрации</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requestContactInfo"
                  checked={requestContactInfo}
                  onChange={(e) => {
                    setRequestContactInfo(e.target.checked)
                    if (!e.target.checked) {
                      // Reset all fields to disabled
                      setFieldsConfig(defaultFieldsConfig)
                    } else {
                      // Enable name as required by default
                      setFieldsConfig({
                        ...defaultFieldsConfig,
                        full_name: { status: 'required' }
                      })
                    }
                  }}
                  className="mr-2 h-4 w-4"
                />
                <label htmlFor="requestContactInfo" className="text-sm font-medium">
                  Запрашивать контактную информацию
                </label>
              </div>
              <p className="text-xs text-neutral-500 -mt-2">
                Настройте, какие данные запрашивать у участников при регистрации.
              </p>
              
              {requestContactInfo && (
                <div className="mt-4 border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Поле</th>
                        <th className="text-left px-3 py-2 font-medium">Название</th>
                        <th className="text-left px-3 py-2 font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {/* Full Name */}
                      <tr>
                        <td className="px-3 py-2 text-neutral-600">Имя</td>
                        <td className="px-3 py-2 text-neutral-500">Полное имя</td>
                        <td className="px-3 py-2">
                          <select
                            value={fieldsConfig.full_name?.status || 'disabled'}
                            onChange={(e) => setFieldsConfig({
                              ...fieldsConfig,
                              full_name: { status: e.target.value as FieldStatus }
                            })}
                            className="w-full p-1.5 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="disabled">Отключено</option>
                            <option value="optional">Опционально</option>
                            <option value="required">Обязательно</option>
                          </select>
                        </td>
                      </tr>
                      
                      {/* Phone */}
                      <tr>
                        <td className="px-3 py-2 text-neutral-600">Телефон</td>
                        <td className="px-3 py-2 text-neutral-500">Телефон</td>
                        <td className="px-3 py-2">
                          <select
                            value={fieldsConfig.phone_number?.status || 'disabled'}
                            onChange={(e) => setFieldsConfig({
                              ...fieldsConfig,
                              phone_number: { status: e.target.value as FieldStatus }
                            })}
                            className="w-full p-1.5 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="disabled">Отключено</option>
                            <option value="optional">Опционально</option>
                            <option value="required">Обязательно</option>
                          </select>
                        </td>
                      </tr>
                      
                      {/* Email */}
                      <tr>
                        <td className="px-3 py-2 text-neutral-600">Email</td>
                        <td className="px-3 py-2 text-neutral-500">Email</td>
                        <td className="px-3 py-2">
                          <select
                            value={fieldsConfig.email?.status || 'disabled'}
                            onChange={(e) => setFieldsConfig({
                              ...fieldsConfig,
                              email: { status: e.target.value as FieldStatus }
                            })}
                            className="w-full p-1.5 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="disabled">Отключено</option>
                            <option value="optional">Опционально</option>
                            <option value="required">Обязательно</option>
                          </select>
                        </td>
                      </tr>
                      
                      {/* Bio */}
                      <tr>
                        <td className="px-3 py-2 text-neutral-600">О себе</td>
                        <td className="px-3 py-2">
                          <Input
                            value={fieldsConfig.bio?.label || 'Кратко о себе'}
                            onChange={(e) => setFieldsConfig({
                              ...fieldsConfig,
                              bio: { 
                                ...fieldsConfig.bio,
                                status: fieldsConfig.bio?.status || 'disabled',
                                label: e.target.value 
                              }
                            })}
                            className="h-8 text-sm"
                            placeholder="Кратко о себе"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={fieldsConfig.bio?.status || 'disabled'}
                            onChange={(e) => setFieldsConfig({
                              ...fieldsConfig,
                              bio: { 
                                ...fieldsConfig.bio,
                                status: e.target.value as FieldStatus,
                                label: fieldsConfig.bio?.label || 'Кратко о себе'
                              }
                            })}
                            className="w-full p-1.5 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="disabled">Отключено</option>
                            <option value="optional">Опционально</option>
                            <option value="required">Обязательно</option>
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-neutral-500 px-3 py-2 bg-neutral-50 border-t">
                    <strong>Отключено</strong> — поле не показывается, используется значение из профиля участника
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Настройки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Статус
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full p-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликовано</option>
                  <option value="cancelled">Отменено</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Ограничение участников
                </label>
                <Input
                  type="number"
                  min="0"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Без ограничений"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Оставьте пустым для неограниченного количества мест
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="isPublic" className="text-sm">
                  Публичное событие
                </label>
              </div>
              <p className="text-xs text-neutral-500">
                Публичные события видны всем, даже неавторизованным пользователям
              </p>

              {isPublic && (
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Ссылка на Telegram-группу для регистрации
                  </label>
                  <Input
                    type="text"
                    value={telegramGroupLink}
                    onChange={(e) => setTelegramGroupLink(e.target.value)}
                    placeholder="https://t.me/your_group"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    ⚠️ Важно: группа должна быть подключена к вашей организации. Участники должны сначала присоединиться к группе, затем смогут зарегистрироваться на событие.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
            >
              {isPending ? 'Сохранение...' : mode === 'create' ? 'Создать событие' : 'Сохранить изменения'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.back()}
              disabled={isPending}
            >
              Отмена
            </Button>

            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}

            {success && (
              <div className="text-green-500 text-sm">
                {mode === 'create' ? 'Событие создано!' : 'Изменения сохранены!'}
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}

