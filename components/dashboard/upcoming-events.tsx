'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface UpcomingEvent {
  id: string
  title: string
  event_date: string
  start_time: string
  end_time: string
  event_type: 'online' | 'offline'
  capacity: number | null
  is_paid: boolean
  cover_image_url: string | null
  registeredCount: number
  registrationRate: number
}

interface UpcomingEventsProps {
  orgId: string
  events: UpcomingEvent[]
}

export default function UpcomingEvents({ orgId, events }: UpcomingEventsProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ближайшие события</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-neutral-500 mb-4">Нет запланированных событий</p>
          <Link href={`/app/${orgId}/events/new`}>
            <Button>Создать событие</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat('ru', { 
      day: 'numeric', 
      month: 'long',
      weekday: 'short'
    }).format(date)
  }

  const getProgressColor = (rate: number) => {
    if (rate >= 70) return 'bg-green-500'
    if (rate >= 30) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Ближайшие события</CardTitle>
        <Link href={`/app/${orgId}/events`}>
          <Button variant="outline">Все события</Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.map(event => (
          <Link
            key={event.id}
            href={`/app/${orgId}/events/${event.id}`}
            className="block border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="flex">
              {/* Event Image or Placeholder */}
              <div className="w-32 h-32 flex-shrink-0 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                {event.cover_image_url ? (
                  <img 
                    src={event.cover_image_url} 
                    alt={event.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg className="w-12 h-12 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>

              {/* Event Info */}
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-neutral-900 line-clamp-1">{event.title}</h3>
                  <div className="flex gap-2 ml-2">
                    {event.event_type === 'online' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                        Онлайн
                      </span>
                    )}
                    {event.is_paid && (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                        Платное
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-sm text-neutral-600 mb-3">
                  {formatDate(event.event_date)} • {event.start_time?.substring(0, 5)} - {event.end_time?.substring(0, 5)}
                </div>

                {event.capacity && (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-neutral-600">Регистрация</span>
                      <span className="font-medium">
                        {event.registeredCount} / {event.capacity} ({event.registrationRate}%)
                      </span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`${getProgressColor(event.registrationRate)} h-full transition-all`}
                        style={{ width: `${Math.min(event.registrationRate, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {!event.capacity && (
                  <div className="text-sm text-neutral-500">
                    {event.registeredCount} зарегистрировано
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

