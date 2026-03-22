'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Users, Ticket, Globe, Lock } from 'lucide-react'
import { useAdminMode } from '@/lib/hooks/useAdminMode'
import { stripTelegramMarkdown } from '@/lib/utils/telegramMarkdownToHtml'

type Event = {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
  event_type: 'online' | 'offline'
  location_info: string | null
  event_date: string
  end_date?: string | null
  start_time: string
  end_time: string
  is_paid: boolean
  price_info: string | null
  capacity: number | null
  status: 'draft' | 'published' | 'cancelled'
  is_public: boolean
  registered_count: number
  available_spots: number | null
}

type Props = {
  events: Event[]
  orgId: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  telegramGroups: Array<{ id: number; tg_chat_id: number; title: string | null }>
}

export default function EventsList({ events, orgId, role, telegramGroups }: Props) {
  const router = useRouter()
  const { adminMode, isAdmin } = useAdminMode(role)
  
  // Default filter: 'upcoming' (Предстоящие)
  const [statusFilter, setStatusFilter] = useState<string>('upcoming')
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode

  // Calculate event categories
  // Event is considered past only on the next day (not on the same day)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  const upcomingEvents = events.filter(e => {
    if (e.status !== 'published') return false
    const eventDate = new Date(e.event_date)
    // Include events today and future dates
    return eventDate >= today
  })
  
  const pastEvents = events.filter(e => {
    if (e.status !== 'published') return false
    const eventDate = new Date(e.event_date)
    // Only consider past if event date is before today (i.e., yesterday or earlier)
    return eventDate < today
  })
  const draftEvents = events.filter(e => e.status === 'draft')

  // Filter events by status
  let filteredEvents = events.filter(event => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'upcoming') {
      const eventDate = new Date(event.event_date)
      return event.status === 'published' && eventDate >= today
    }
    if (statusFilter === 'past') {
      const eventDate = new Date(event.event_date)
      return event.status === 'published' && eventDate < today
    }
    return event.status === statusFilter
  })

  // Apply sorting based on filter
  // 'all' and 'past': newest first (desc)
  // 'upcoming' and 'draft': oldest first (asc)
  if (statusFilter === 'all' || statusFilter === 'past') {
    filteredEvents = [...filteredEvents].sort((a, b) => 
      new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
    )
  } else {
    // upcoming, draft
    filteredEvents = [...filteredEvents].sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
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

  // Strip HTML tags from description — the source may contain <strong>, <em> etc.
  // that should not be rendered as literal text in the card preview.
  const stripHtml = (text: string) => text.replace(/<[^>]+>/g, '')

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      published: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    const labels = {
      draft: 'Черновик',
      published: 'Опубликовано',
      cancelled: 'Отменено'
    }
    return (
      // shrink-0 + whitespace-nowrap: badge never wraps or overflows the card edge
      <span className={`shrink-0 whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  const renderEventCard = (event: Event) => (
    <Card key={event.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/p/${orgId}/events/${event.id}`)}>
      <CardContent className="p-0">
        {event.cover_image_url && (
          <div className="h-48 w-full overflow-hidden rounded-t-lg">
            <img
              src={event.cover_image_url}
              alt={event.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        {/* p-3 on mobile, p-4 on sm+ — reduces edge-to-content gap on small screens */}
        <div className="p-3 sm:p-4">
          {/* gap-2 + min-w-0/flex-1 on title: prevents badge from overflowing or squishing title */}
          <div className="flex items-start gap-2 mb-2">
            <h3 className="text-lg font-semibold min-w-0 flex-1">{event.title}</h3>
            {getStatusBadge(event.status)}
          </div>

          {event.description && (
            <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
              {/* stripHtml removes <strong> etc. that appear as literal text in previews */}
              {stripHtml(stripTelegramMarkdown(event.description))}
            </p>
          )}

          <div className="space-y-2 text-sm text-neutral-600">
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              <span>
                {event.end_date && event.end_date !== event.event_date
                  ? `${formatDate(event.event_date)} - ${formatDate(event.end_date)}, ${formatTime(event.start_time)} - ${formatTime(event.end_time)}`
                  : `${formatDate(event.event_date)}, ${formatTime(event.start_time)} - ${formatTime(event.end_time)}`}
              </span>
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
                  <span>Офлайн</span>
                </>
              )}
            </div>

            <div className="flex items-center">
              <Users className="w-4 h-4 mr-2" />
              <span>
                {event.registered_count} зарегистрировано
                {event.capacity && ` / ${event.capacity} мест`}
              </span>
            </div>

            {event.is_paid && (
              <div className="flex items-center">
                <Ticket className="w-4 h-4 mr-2" />
                <span>Платное</span>
              </div>
            )}

            <div className="flex items-center">
              {event.is_public ? (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  <span>Публичное</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  <span>Для участников пространства</span>
                </>
              )}
            </div>
          </div>

          {event.capacity && event.available_spots !== null && event.available_spots <= 5 && event.available_spots > 0 && (
            <div className="mt-3 text-sm text-amber-600">
              Осталось всего {event.available_spots} мест!
            </div>
          )}

          {event.capacity && event.available_spots === 0 && (
            <div className="mt-3 text-sm text-red-600 font-medium">
              Мест нет
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div>
      {/*
        Mobile layout: filters wrap to new line, "Создать" goes below.
        Counts in brackets hidden on mobile (sm:inline) — keeps buttons compact
        and prevents horizontal overflow / scroll on narrow screens.
      */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={statusFilter === 'upcoming' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('upcoming')}
          >
            Предстоящие<span className="hidden sm:inline"> ({upcomingEvents.length})</span>
          </Button>
          {showAdminFeatures && (
            <Button
              size="sm"
              variant={statusFilter === 'draft' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('draft')}
            >
              Черновики<span className="hidden sm:inline"> ({draftEvents.length})</span>
            </Button>
          )}
          <Button
            size="sm"
            variant={statusFilter === 'past' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('past')}
          >
            Прошедшие<span className="hidden sm:inline"> ({pastEvents.length})</span>
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('all')}
          >
            Все<span className="hidden sm:inline"> ({events.length})</span>
          </Button>
        </div>

        {showAdminFeatures && (
          <Button size="sm" className="self-start sm:self-auto" onClick={() => router.push(`/p/${orgId}/events/new`)}>
            Создать событие
          </Button>
        )}
      </div>

      {filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-neutral-500">
            {statusFilter === 'all' ? (
              showAdminFeatures ? (
                <>
                  Пока нет событий.{' '}
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => router.push(`/p/${orgId}/events/new`)}
                  >
                    Создайте первое событие
                  </button>
                </>
              ) : (
                'Пока нет событий'
              )
            ) : (
              `Нет событий в категории "${statusFilter === 'upcoming' ? 'Предстоящие' : statusFilter === 'past' ? 'Прошедшие' : statusFilter === 'draft' ? 'Черновики' : statusFilter}"`
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredEvents.map(renderEventCard)}
        </div>
      )}
    </div>
  )
}

