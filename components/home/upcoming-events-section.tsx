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

export default function UpcomingEventsSection({ events, orgId }: Props) {
  if (events.length === 0) {
    return (
      <section className="mb-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              📅 Предстоящие события
            </h2>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                Пока нет предстоящих событий
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

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

  return (
    <section className="mb-12">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              📅 Предстоящие события
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/p/${orgId}/events/${event.id}`}
                className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
              >
                {event.cover_image_url && (
                  <div className="h-48 w-full overflow-hidden">
                    <img
                      src={event.cover_image_url}
                      alt={event.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                    {event.title}
                  </h3>
                  
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>{formatDate(event.event_date)}, {formatTime(event.start_time)}</span>
                    </div>
                    
                    <div className="flex items-center">
                      {event.event_type === 'online' ? (
                        <>
                          <Globe className="w-4 h-4 mr-2" />
                          <span>Онлайн</span>
                        </>
                      ) : (
                        <>
                          <MapPin className="w-4 h-4 mr-2" />
                          <span>{event.location_info || 'Офлайн'}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-2" />
                      <span>{event.registered_count} зарегистрировались</span>
                    </div>
                  </div>

                  {event.is_user_registered ? (
                    <div className="text-sm font-medium text-green-600 dark:text-green-400">
                      ✓ Вы зарегистрированы
                    </div>
                  ) : (
                    <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                      Зарегистрироваться
                    </button>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

