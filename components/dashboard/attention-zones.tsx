'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

interface AttentionZonesProps {
  orgId: string
  criticalEvents: CriticalEvent[]
  churningParticipants: ChurningParticipant[]
  inactiveNewcomers: InactiveNewcomer[]
}

export default function AttentionZones({
  orgId,
  criticalEvents,
  churningParticipants,
  inactiveNewcomers
}: AttentionZonesProps) {
  const hasAlerts = criticalEvents.length > 0 || churningParticipants.length > 0 || inactiveNewcomers.length > 0

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
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          Зоны внимания
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Critical Events */}
        {criticalEvents.length > 0 && (
          <div className="border-l-4 border-red-500 pl-4 py-2">
            <h3 className="font-semibold text-red-900 mb-2">Критичные события</h3>
            <div className="space-y-3">
              {criticalEvents.map(event => (
                <Link
                  key={event.id}
                  href={`/p/${orgId}/events/${event.id}`}
                  className="block p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-red-900">{event.title}</div>
                      <div className="text-sm text-red-700 mt-1">
                        {formatDate(event.event_date)} • {event.start_time?.substring(0, 5)}
                      </div>
                      <div className="text-sm text-red-800 mt-1">
                        <span className="font-medium">{event.registeredCount}</span> из{' '}
                        <span className="font-medium">{event.capacity}</span> зарегистрировано
                        ({event.registrationRate}%)
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="text-xs text-red-600 mt-2 italic">
                    Отправьте напоминание в группы или продлите регистрацию
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Churning Participants */}
        {churningParticipants.length > 0 && (
          <div className="border-l-4 border-amber-500 pl-4 py-2">
            <h3 className="font-semibold text-amber-900 mb-2">Участники на грани оттока</h3>
            <div className="space-y-2">
              {churningParticipants.map(participant => (
                <Link
                  key={participant.participant_id}
                  href={`/p/${orgId}/members/${participant.participant_id}`}
                  className="block p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-amber-900">
                        {participant.full_name || participant.username || 'Без имени'}
                      </div>
                      <div className="text-sm text-amber-700">
                        Молчит {participant.days_since_activity} дней • Ранее был активен
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="text-xs text-amber-600 mt-2 italic">
                    Отправьте личное сообщение или пригласите на событие
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Inactive Newcomers */}
        {inactiveNewcomers.length > 0 && (
          <div className="border-l-4 border-blue-500 pl-4 py-2">
            <h3 className="font-semibold text-blue-900 mb-2">Новички без активности</h3>
            <div className="space-y-2">
              {inactiveNewcomers.map(newcomer => (
                <Link
                  key={newcomer.participant_id}
                  href={`/p/${orgId}/members/${newcomer.participant_id}`}
                  className="block p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-blue-900">
                        {newcomer.full_name || newcomer.username || 'Без имени'}
                      </div>
                      <div className="text-sm text-blue-700">
                        Присоединился {newcomer.days_since_join} дней назад • {newcomer.activity_count} сообщений
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="text-xs text-blue-600 mt-2 italic">
                    Отправьте welcome-сообщение или вовлеките в дискуссию
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

