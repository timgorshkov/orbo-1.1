'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Calendar, MapPin, Clock, CheckCircle2, XCircle, AlertCircle, CreditCard, Users, Trophy } from 'lucide-react'
import type { ParticipantDetailResult, ParticipantEventRegistration } from '@/lib/types/participant'

interface ParticipantEventsCardProps {
  orgId: string
  detail: ParticipantDetailResult
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  return timeStr.slice(0, 5)
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'registered':
      return { label: 'Зарегистрирован', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 }
    case 'attended':
      return { label: 'Присутствовал', color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
    case 'cancelled':
      return { label: 'Отменил', color: 'bg-gray-100 text-gray-600', icon: XCircle }
    case 'no_show':
      return { label: 'Не пришёл', color: 'bg-red-100 text-red-700', icon: AlertCircle }
    default:
      return { label: status, color: 'bg-gray-100 text-gray-600', icon: AlertCircle }
  }
}

function getPaymentBadge(paymentStatus: string | null) {
  switch (paymentStatus) {
    case 'paid':
      return { label: 'Оплачено', color: 'bg-green-100 text-green-700' }
    case 'pending':
      return { label: 'Ожидает оплаты', color: 'bg-yellow-100 text-yellow-700' }
    case 'overdue':
      return { label: 'Просрочена', color: 'bg-red-100 text-red-700' }
    case 'refunded':
      return { label: 'Возврат', color: 'bg-purple-100 text-purple-700' }
    default:
      return null
  }
}

export default function ParticipantEventsCard({ orgId, detail }: ParticipantEventsCardProps) {
  const registrations = detail.eventRegistrations || []

  const stats = useMemo(() => {
    const total = registrations.length
    const attended = registrations.filter(r => r.status === 'attended').length
    const registered = registrations.filter(r => r.status === 'registered').length
    const noShow = registrations.filter(r => r.status === 'no_show').length
    const cancelled = registrations.filter(r => r.status === 'cancelled').length
    const paid = registrations.filter(r => r.payment_status === 'paid').length
    const totalPaid = registrations.reduce((sum, r) => sum + (r.paid_amount || 0), 0)
    
    // Events that already happened (event_date < now)
    const now = new Date()
    const pastEvents = registrations.filter(r => {
      if (!r.event?.event_date) return false
      return new Date(r.event.event_date) < now
    })
    const attendanceRate = pastEvents.length > 0 
      ? Math.round((pastEvents.filter(r => r.status === 'attended').length / pastEvents.length) * 100)
      : null

    return { total, attended, registered, noShow, cancelled, paid, totalPaid, attendanceRate }
  }, [registrations])

  // Separate upcoming and past events
  const { upcoming, past } = useMemo(() => {
    const now = new Date()
    const upcoming: ParticipantEventRegistration[] = []
    const past: ParticipantEventRegistration[] = []

    registrations.forEach(reg => {
      if (!reg.event) return
      const eventDate = reg.event.event_date ? new Date(reg.event.event_date) : null
      if (eventDate && eventDate > now && reg.status !== 'cancelled') {
        upcoming.push(reg)
      } else {
        past.push(reg)
      }
    })

    // Sort upcoming by date ascending, past by date descending
    upcoming.sort((a, b) => {
      const dateA = a.event?.event_date ? new Date(a.event.event_date).getTime() : 0
      const dateB = b.event?.event_date ? new Date(b.event.event_date).getTime() : 0
      return dateA - dateB
    })

    return { upcoming, past }
  }, [registrations])

  if (registrations.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 text-center">
        <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-3" />
        <h3 className="text-sm font-medium text-gray-900 mb-1">Нет регистраций на события</h3>
        <p className="text-sm text-gray-500">
          Участник пока не регистрировался ни на одно событие
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-white p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-1">Всего регистраций</div>
        </div>
        <div className="rounded-lg border bg-white p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.attended}</div>
          <div className="text-xs text-gray-500 mt-1">Посетил</div>
        </div>
        <div className="rounded-lg border bg-white p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{stats.noShow}</div>
          <div className="text-xs text-gray-500 mt-1">Не пришёл</div>
        </div>
        <div className="rounded-lg border bg-white p-4 text-center">
          {stats.attendanceRate !== null ? (
            <>
              <div className="text-2xl font-bold text-blue-600">{stats.attendanceRate}%</div>
              <div className="text-xs text-gray-500 mt-1">Доходимость</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-400">—</div>
              <div className="text-xs text-gray-500 mt-1">Доходимость</div>
            </>
          )}
        </div>
      </div>

      {/* Loyalty badge */}
      {stats.attended >= 3 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Trophy className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            Постоянный участник — посетил {stats.attended} событий
          </span>
        </div>
      )}

      {/* Payment summary */}
      {stats.totalPaid > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <CreditCard className="h-5 w-5 text-green-600 flex-shrink-0" />
          <span className="text-sm font-medium text-green-800">
            Оплачено: {stats.totalPaid.toLocaleString('ru-RU')} ₽ за {stats.paid} событий
          </span>
        </div>
      )}

      {/* Upcoming events */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Предстоящие события ({upcoming.length})
          </h3>
          <div className="space-y-2">
            {upcoming.map(reg => (
              <EventRegistrationRow key={reg.id} registration={reg} orgId={orgId} />
            ))}
          </div>
        </div>
      )}

      {/* Past events */}
      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Прошедшие события ({past.length})
          </h3>
          <div className="space-y-2">
            {past.map(reg => (
              <EventRegistrationRow key={reg.id} registration={reg} orgId={orgId} isPast />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EventRegistrationRow({ 
  registration, 
  orgId,
  isPast = false 
}: { 
  registration: ParticipantEventRegistration
  orgId: string
  isPast?: boolean 
}) {
  const event = registration.event
  if (!event) return null

  const statusBadge = getStatusBadge(registration.status)
  const StatusIcon = statusBadge.icon
  const paymentBadge = event.requires_payment ? getPaymentBadge(registration.payment_status) : null

  return (
    <Link
      href={`/p/${orgId}/events/${event.id}`}
      className={`block rounded-lg border bg-white p-4 hover:bg-gray-50 transition-colors ${
        isPast ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-900 truncate">{event.title}</h4>
            {registration.quantity > 1 && (
              <span className="flex items-center gap-0.5 text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                <Users className="h-3 w-3" />
                {registration.quantity}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {event.event_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(event.event_date)}
                {event.start_time && ` ${formatTime(event.start_time)}`}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{event.location}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge.color}`}>
            <StatusIcon className="h-3 w-3" />
            {statusBadge.label}
          </span>
          {paymentBadge && (
            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${paymentBadge.color}`}>
              {paymentBadge.label}
              {registration.paid_amount ? ` ${registration.paid_amount.toLocaleString('ru-RU')} ₽` : ''}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
