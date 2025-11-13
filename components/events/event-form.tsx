'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Event = {
  id?: string
  title: string
  description: string | null
  cover_image_url: string | null
  event_type: 'online' | 'offline'
  location_info: string | null
  event_date: string
  start_time: string
  end_time: string
  is_paid: boolean
  price_info: string | null
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
  const [coverImageUrl, setCoverImageUrl] = useState(initialEvent?.cover_image_url || '')
  const [eventType, setEventType] = useState<'online' | 'offline'>(initialEvent?.event_type || 'online')
  const [locationInfo, setLocationInfo] = useState(initialEvent?.location_info || '')
  const [eventDate, setEventDate] = useState(initialEvent?.event_date || '')
  const [startTime, setStartTime] = useState(initialEvent?.start_time || '')
  const [endTime, setEndTime] = useState(initialEvent?.end_time || '')
  const [isPaid, setIsPaid] = useState(initialEvent?.is_paid || false)
  const [priceInfo, setPriceInfo] = useState(initialEvent?.price_info || '')
  const [capacity, setCapacity] = useState<string>(initialEvent?.capacity?.toString() || '')
  const [status, setStatus] = useState<'draft' | 'published' | 'cancelled'>(
    initialEvent?.status || 'draft'
  )
  const [isPublic, setIsPublic] = useState(initialEvent?.is_public || false)
  const [telegramGroupLink, setTelegramGroupLink] = useState(initialEvent?.telegram_group_link || '')
  
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Validation
    if (!title || !eventDate || !startTime || !endTime) {
      setError('Пожалуйста, заполните все обязательные поля')
      return
    }

    // Validate time range
    if (startTime >= endTime) {
      setError('Время окончания должно быть позже времени начала')
      return
    }

    const eventData = {
      orgId,
      title,
      description,
      coverImageUrl: coverImageUrl || null,
      eventType,
      locationInfo: locationInfo || null,
      eventDate,
      startTime,
      endTime,
      isPaid,
      priceInfo: isPaid ? priceInfo : null,
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

        setSuccess(true)
        
        // Redirect to event detail page
        setTimeout(() => {
          router.push(`/app/${orgId}/events/${data.event.id}`)
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
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Расскажите о событии, программе, спикерах..."
                  className="w-full min-h-[150px] p-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  URL обложки
                </label>
                <Input
                  type="url"
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
                {coverImageUrl && (
                  <div className="mt-3">
                    <img 
                      src={coverImageUrl} 
                      alt="Превью обложки"
                      className="max-h-48 rounded-lg border border-neutral-200"
                      onError={() => setCoverImageUrl('')}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Дата и время</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Дата события <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Стоимость</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isPaid"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="isPaid" className="text-sm font-medium">
                  Платное событие
                </label>
              </div>

              {isPaid && (
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Информация о стоимости и оплате
                  </label>
                  <textarea
                    value={priceInfo}
                    onChange={(e) => setPriceInfo(e.target.value)}
                    placeholder="Например: 500 рублей. Оплата по ссылке..."
                    className="w-full min-h-[100px] p-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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

