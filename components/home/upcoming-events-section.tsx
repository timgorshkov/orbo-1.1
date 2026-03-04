import Link from 'next/link'
import { Calendar, MapPin, Globe, Users } from 'lucide-react'

interface Event {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
  event_date: string
  start_time: string
  event_type: 'online' | 'offline'
  location_info: string | null
  registered_count: number
  is_user_registered: boolean
}

interface Props {
  events: Event[]
  orgId: string
}

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const formatTime = (timeStr: string) => timeStr.substring(0, 5)

export default function UpcomingEventsSection({ events, orgId }: Props) {
  return (
    <section className="max-w-5xl mx-auto px-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-neutral-900">Предстоящие события</h2>
        <Link href={`/p/${orgId}/events`} className="text-sm text-blue-600 hover:text-blue-700">
          Все события →
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 text-center">
          <p className="text-sm text-neutral-500">Пока нет предстоящих событий</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/p/${orgId}/events/${event.id}`}
              className="block bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              {event.cover_image_url && (
                <div className="h-36 w-full overflow-hidden">
                  <img
                    src={event.cover_image_url}
                    alt={event.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-sm text-neutral-900 mb-2 line-clamp-2">
                  {event.title}
                </h3>

                <div className="space-y-1.5 text-sm text-neutral-500 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <span>{formatDate(event.event_date)}, {formatTime(event.start_time)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {event.event_type === 'online' ? (
                      <>
                        <Globe className="w-4 h-4 flex-shrink-0" />
                        <span>Онлайн</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        <span>{event.location_info || 'Офлайн'}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <span>{event.registered_count} зарегистрировались</span>
                  </div>
                </div>

                {event.is_user_registered ? (
                  <div className="text-sm font-medium text-green-600">✓ Вы зарегистрированы</div>
                ) : (
                  <div className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg text-center">
                    Зарегистрироваться
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
