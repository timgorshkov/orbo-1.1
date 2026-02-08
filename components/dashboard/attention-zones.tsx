'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, ChevronRight, MessageCircleWarning, HelpCircle, Volume2 } from 'lucide-react'

interface CriticalEvent {
  id: string
  title: string
  event_date: string
  start_time: string
  registeredCount: number
  capacity: number
  registrationRate: number
}

interface AIAlert {
  id: string
  type: string
  message: string
  severity: string
  created_at: string
  group_name?: string
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
  aiAlerts?: AIAlert[]
}

export default function AttentionZones({
  orgId,
  criticalEvents,
  churningParticipants,
  inactiveNewcomers,
  hasMore = {},
  aiAlerts = []
}: AttentionZonesProps) {
  // Determine what to show on dashboard (max 3 total items, prioritized)
  // Priority: critical events > AI alerts > inactive newcomers > churning participants
  const hasHighPriorityAlerts = criticalEvents.length > 0 || aiAlerts.length > 0 || inactiveNewcomers.length > 0
  // Only show churning on dashboard if there's nothing else
  const showChurningOnDashboard = !hasHighPriorityAlerts
  
  const hasAlerts = criticalEvents.length > 0 || aiAlerts.length > 0 || inactiveNewcomers.length > 0 || (showChurningOnDashboard && churningParticipants.length > 0)

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

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} мин. назад`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} ч. назад`
    const days = Math.floor(hours / 24)
    return `${days} дн. назад`
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

        {/* AI Alerts - color matches notification type */}
        {aiAlerts.length > 0 && (() => {
          // Separate alerts by severity: red (negative) vs amber (questions, inactive)
          const hasRedAlerts = aiAlerts.some(a => a.type === 'negative_discussion');
          // Use red border if any negative alerts, otherwise amber
          const borderColor = hasRedAlerts ? 'border-red-500' : 'border-amber-500';
          const headerColor = hasRedAlerts ? 'text-red-900' : 'text-amber-900';
          
          return (
            <div className={`border-l-4 ${borderColor} pl-3 py-1`}>
              <h3 className={`font-semibold ${headerColor} text-sm mb-1.5`}>AI-алерты</h3>
              <div className="space-y-1">
                {aiAlerts.slice(0, 2).map(alert => {
                  // Per-alert colors: red for negative, amber for questions/inactive
                  const isNegative = alert.type === 'negative_discussion';
                  const alertBg = isNegative ? 'bg-red-50' : 'bg-amber-50';
                  const alertTextColor = isNegative ? 'text-red-600' : 'text-amber-600';
                  const alertSubColor = isNegative ? 'text-red-500' : 'text-amber-500';
                  const alertTimeColor = isNegative ? 'text-red-400' : 'text-amber-400';
                  
                  const icon = alert.type === 'negative_discussion' 
                    ? <MessageCircleWarning className={`h-3.5 w-3.5 ${alertSubColor} flex-shrink-0 mt-0.5`} />
                    : alert.type === 'unanswered_question'
                    ? <HelpCircle className={`h-3.5 w-3.5 ${alertSubColor} flex-shrink-0 mt-0.5`} />
                    : <Volume2 className={`h-3.5 w-3.5 ${alertSubColor} flex-shrink-0 mt-0.5`} />
                  
                  const typeLabel = alert.type === 'negative_discussion' 
                    ? 'Негатив' 
                    : alert.type === 'unanswered_question' 
                    ? 'Вопрос без ответа' 
                    : 'Неактивная группа'

                  const timeAgo = formatTimeAgo(alert.created_at)

                  return (
                    <div
                      key={alert.id}
                      className={`block px-2 py-1.5 rounded ${alertBg}`}
                    >
                      <div className="flex items-start gap-2">
                        {icon}
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${alertTextColor} block truncate`}>
                            {typeLabel}{alert.group_name ? ` • ${alert.group_name}` : ''}
                          </span>
                          <span className={`text-xs ${alertSubColor} line-clamp-2`}>
                            {alert.message?.substring(0, 120)}{(alert.message?.length || 0) > 120 ? '...' : ''}
                          </span>
                          <span className={`text-xs ${alertTimeColor} mt-0.5 block`}>{timeAgo}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {aiAlerts.length > 2 && (
                  <Link
                    href={`/p/${orgId}/notifications`}
                    className="block px-2 py-1 text-xs text-amber-600 hover:text-amber-700"
                  >
                    Ещё {aiAlerts.length - 2} алертов →
                  </Link>
                )}
              </div>
            </div>
          );
        })()}

        {/* Churning Participants - only show if no higher-priority alerts */}
        {showChurningOnDashboard && churningParticipants.length > 0 && (
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

        {/* Inactive Newcomers - limit to 2 on dashboard */}
        {inactiveNewcomers.length > 0 && (
          <div className="border-l-4 border-blue-500 pl-3 py-1">
            <h3 className="font-semibold text-blue-900 text-sm mb-1.5">Новички без активности</h3>
            <div className="space-y-1">
              {inactiveNewcomers.slice(0, 2).map(newcomer => (
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
              {(inactiveNewcomers.length > 2 || (hasMore.newcomers ?? 0) > 0) && (
                <Link
                  href={`/p/${orgId}/notifications?type=inactive_newcomer`}
                  className="block px-2 py-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  Ещё {Math.max(0, inactiveNewcomers.length - 2) + (hasMore.newcomers || 0)} новичков →
                </Link>
              )}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}

