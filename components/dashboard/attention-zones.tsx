'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, ChevronRight } from 'lucide-react'

interface CriticalEvent {
  id: string
  title: string
  event_date: string
  start_time: string
  registeredCount: number
  capacity: number
  registrationRate: number
}

interface ChurningParticipant {
  participant_id: string
  full_name: string
  username: string
  days_since_activity: number
  previous_activity_score: number
}

interface InactiveNewcomer {
  participant_id: string
  full_name: string
  username: string
  days_since_join: number
  activity_count: number
}

interface HasMore {
  churning?: number
  newcomers?: number
  events?: number
}

interface AttentionZonesProps {
  orgId: string
  criticalEvents: CriticalEvent[]
  churningParticipants: ChurningParticipant[]
  inactiveNewcomers: InactiveNewcomer[]
  hasMore?: HasMore
}

export default function AttentionZones({
  orgId,
  criticalEvents,
  churningParticipants,
  inactiveNewcomers,
  hasMore = {}
}: AttentionZonesProps) {
  const hasAlerts = criticalEvents.length > 0 || churningParticipants.length > 0 || inactiveNewcomers.length > 0
  const totalMore = (hasMore.churning || 0) + (hasMore.newcomers || 0) + (hasMore.events || 0)

  if (!hasAlerts) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-4xl mb-2">✨</div>
            <p className="text-green-800 font-medium">Все отлично!</p>
            <p className="text-sm text-green-600 mt-1">Нет критичных зон, требующих внимания</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(date)
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            Зоны внимания
          </div>
          <Link
            href={`/p/${orgId}/notifications`}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-normal"
          >
            <Bell className="h-4 w-4" />
            Все уведомления
            <ChevronRight className="h-4 w-4" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Critical Events */}
        {criticalEvents.length > 0 && (
          <div className="border-l-4 border-red-500 pl-3 py-1">
            <h3 className="font-semibold text-red-900 text-sm mb-1.5">Критичные события</h3>
            <div className="space-y-1">
              {criticalEvents.map(event => (
                <Link
                  key={event.id}
                  href={`/p/${orgId}/events/${event.id}`}
                  className="block px-2 py-1.5 rounded bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-red-900 truncate block">{event.title}</span>
                      <span className="text-xs text-red-600">
                        {formatDate(event.event_date)} • {event.registeredCount}/{event.capacity} ({event.registrationRate}%) • <span className="italic">Напомните</span>
                      </span>
                    </div>
                    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Churning Participants */}
        {churningParticipants.length > 0 && (
          <div className="border-l-4 border-amber-500 pl-3 py-1">
            <h3 className="font-semibold text-amber-900 text-sm mb-1.5">Участники на грани оттока</h3>
            <div className="space-y-1">
              {churningParticipants.map(participant => (
                <Link
                  key={participant.participant_id}
                  href={`/p/${orgId}/members/${participant.participant_id}`}
                  className="block px-2 py-1.5 rounded bg-amber-50 hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-amber-900 truncate block">
                        {participant.full_name || participant.username || 'Без имени'}
                      </span>
                      <span className="text-xs text-amber-600">
                        Молчит {participant.days_since_activity} дн. • <span className="italic">Напишите лично</span>
                      </span>
                    </div>
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
              {(hasMore.churning ?? 0) > 0 && (
                <Link
                  href={`/p/${orgId}/notifications?type=churning_participant`}
                  className="block px-2 py-1 text-xs text-amber-600 hover:text-amber-700"
                >
                  Ещё {hasMore.churning} участников →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Inactive Newcomers */}
        {inactiveNewcomers.length > 0 && (
          <div className="border-l-4 border-blue-500 pl-3 py-1">
            <h3 className="font-semibold text-blue-900 text-sm mb-1.5">Новички без активности</h3>
            <div className="space-y-1">
              {inactiveNewcomers.map(newcomer => (
                <Link
                  key={newcomer.participant_id}
                  href={`/p/${orgId}/members/${newcomer.participant_id}`}
                  className="block px-2 py-1.5 rounded bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-blue-900 truncate block">
                        {newcomer.full_name || newcomer.username || 'Без имени'}
                      </span>
                      <span className="text-xs text-blue-600">
                        {newcomer.days_since_join} дн. назад • {newcomer.activity_count} сообщ. • <span className="italic">Отправьте welcome</span>
                      </span>
                    </div>
                    <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
              {(hasMore.newcomers ?? 0) > 0 && (
                <Link
                  href={`/p/${orgId}/notifications?type=inactive_newcomer`}
                  className="block px-2 py-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  Ещё {hasMore.newcomers} новичков →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Summary link */}
        {totalMore > 0 && (
          <div className="pt-2 border-t border-amber-200">
            <Link
              href={`/p/${orgId}/notifications`}
              className="text-sm text-gray-600 hover:text-gray-800 flex items-center justify-center gap-1"
            >
              Все уведомления ({criticalEvents.length + churningParticipants.length + inactiveNewcomers.length + totalMore})
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

