'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Users, DollarSign, Globe, Download, X } from 'lucide-react'

type Event = {
  id: string
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
  registered_count: number
  available_spots: number | null
  is_user_registered?: boolean
}

type Org = {
  id: string
  name: string
}

type Props = {
  event: Event
  org: Org
  isAuthenticated?: boolean
  isOrgMember?: boolean
}

export default function PublicEventDetail({ event, org, isAuthenticated = false, isOrgMember = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState(event.is_user_registered || false)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5)
  }

  const handleRegister = () => {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch(`/api/events/${event.id}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось зарегистрироваться')
        }

        // Success!
        setIsRegistered(true)
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  const handleUnregister = () => {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch(`/api/events/${event.id}/register`, {
          method: 'DELETE'
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось отменить регистрацию')
        }

        setIsRegistered(false)
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }


  const handleDownloadICS = () => {
    window.open(`/api/events/${event.id}/ics`, '_blank')
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header with org branding */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h2 className="text-xl font-semibold">{org.name}</h2>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Cover Image */}
        {event.cover_image_url && (
          <div className="mb-8 h-96 w-full overflow-hidden rounded-lg shadow-lg">
            <img 
              src={event.cover_image_url} 
              alt={event.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{event.title}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {event.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Описание</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-neutral-700">
                    {event.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {event.is_paid && event.price_info && (
              <Card>
                <CardHeader>
                  <CardTitle>Стоимость и оплата</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-neutral-700">
                    {event.price_info}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Информация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start">
                  <Calendar className="w-5 h-5 mr-3 mt-0.5 text-neutral-500 flex-shrink-0" />
                  <div>
                    <div className="font-medium">{formatDate(event.event_date)}</div>
                    <div className="text-sm text-neutral-600">
                      {formatTime(event.start_time)} - {formatTime(event.end_time)}
                    </div>
                  </div>
                </div>

                <div className="flex items-start">
                  {event.event_type === 'online' ? (
                    <Globe className="w-5 h-5 mr-3 mt-0.5 text-neutral-500 flex-shrink-0" />
                  ) : (
                    <MapPin className="w-5 h-5 mr-3 mt-0.5 text-neutral-500 flex-shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">
                      {event.event_type === 'online' ? 'Онлайн' : 'Офлайн'}
                    </div>
                    {event.location_info && (
                      <div className="text-sm text-neutral-600 break-words">
                        {event.location_info}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start">
                  <Users className="w-5 h-5 mr-3 mt-0.5 text-neutral-500 flex-shrink-0" />
                  <div>
                    <div className="font-medium">
                      {event.registered_count} 
                      {event.capacity && ` / ${event.capacity}`}
                    </div>
                    <div className="text-sm text-neutral-600">
                      Зарегистрировано
                    </div>
                  </div>
                </div>

                {event.is_paid && (
                  <div className="flex items-start">
                    <DollarSign className="w-5 h-5 mr-3 mt-0.5 text-neutral-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Платное</div>
                      <div className="text-sm text-neutral-600">
                        См. информацию о стоимости ниже
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Registration */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                {isRegistered ? (
                  <>
                    <div className="text-center py-2">
                      <div className="text-green-600 font-medium mb-1">
                        ✓ Вы зарегистрированы
                      </div>
                      <div className="text-sm text-neutral-600">
                        Мы напомним вам о событии
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleDownloadICS}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Добавить в календарь
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleUnregister}
                      disabled={isPending}
                    >
                      {isPending ? 'Отмена...' : 'Отменить регистрацию'}
                    </Button>
                  </>
                ) : (
                  <>
                    {event.available_spots === 0 ? (
                      <div className="text-center py-4">
                        <div className="text-red-600 font-medium mb-1">
                          Мест нет
                        </div>
                        <div className="text-sm text-neutral-600">
                          Все места заняты
                        </div>
                      </div>
                    ) : (
                      <>
                        {event.available_spots && event.available_spots <= 5 && (
                          <div className="text-center text-sm text-amber-600 mb-2">
                            Осталось всего {event.available_spots} мест!
                          </div>
                        )}
                        <Button
                          className="w-full"
                          onClick={handleRegister}
                          disabled={isPending || !isAuthenticated}
                        >
                          {isPending ? 'Регистрация...' : 'Зарегистрироваться'}
                        </Button>
                        {!isAuthenticated && (
                          <p className="text-xs text-center text-neutral-500">
                            <a href="/signin" className="text-blue-600 hover:underline">Войдите</a>, чтобы зарегистрироваться
                          </p>
                        )}
                      </>
                    )}

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleDownloadICS}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Добавить в календарь
                    </Button>
                  </>
                )}

                {error && (
                  <div className="text-sm text-red-500 text-center">
                    {error}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-neutral-500">
          <p>Powered by Orbo</p>
        </div>
      </footer>

    </div>
  )
}

