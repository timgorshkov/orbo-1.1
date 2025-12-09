'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Users, Ticket, Globe, Download, X } from 'lucide-react'

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
  is_public: boolean
  telegram_group_link: string | null
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
                      event.event_type === 'online' ? (
                        // For online events, show link only to registered users
                        isRegistered ? (
                          <a 
                            href={event.location_info.startsWith('http') ? event.location_info : `https://${event.location_info}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline break-all"
                          >
                            {event.location_info}
                          </a>
                        ) : (
                          <div className="text-sm text-neutral-500 italic">
                            Ссылка будет доступна после регистрации
                          </div>
                        )
                      ) : (
                        // For offline events, always show address
                        <div className="text-sm text-neutral-600 break-words">
                          {event.location_info}
                        </div>
                      )
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
                    <Ticket className="w-5 h-5 mr-3 mt-0.5 text-neutral-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Платное</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pricing */}
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
                        {event.is_public && event.telegram_group_link && !isAuthenticated && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
                            <h4 className="font-medium text-blue-900 mb-2">Для регистрации:</h4>
                            <ol className="text-sm text-blue-800 space-y-2 mb-3 list-decimal list-inside">
                              <li>Присоединитесь к группе в Telegram</li>
                              <li>Затем нажмите "Зарегистрироваться"</li>
                            </ol>
                            <a 
                              href={event.telegram_group_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
                            >
                              Присоединиться к группе
                            </a>
                          </div>
                        )}
                        <Button
                          className="w-full"
                          onClick={handleRegister}
                          disabled={isPending || (!isOrgMember && !isAuthenticated)}
                        >
                          {isPending ? 'Регистрация...' : 'Зарегистрироваться'}
                        </Button>
                        {!isAuthenticated && (
                          <p className="text-xs text-center text-neutral-500">
                            <a href={`/p/${org.id}/auth`} className="text-blue-600 hover:underline">Войдите через Telegram</a>, чтобы зарегистрироваться
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
          <p>
            Работает на{' '}
            <a
              href="https://www.orbo.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Orbo
            </a>
            {' '}— платформе для управления сообществами
          </p>
        </div>
      </footer>

    </div>
  )
}

