'use client'

import { useMemo } from 'react'
import { BarChart3, Users, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Registration {
  id: string
  status: string
  registered_at: string
  payment_status?: string | null
  paid_amount?: number | null
  price?: number | null
  quantity?: number
  participants?: {
    id: string
    full_name: string | null
  } | null
  registration_data?: Record<string, any> | null
}

interface EventAnalyticsTabProps {
  eventId: string
  eventDate: string | null
  requiresPayment: boolean
  defaultPrice: number | null
  capacity: number | null
  registrations: Registration[]
}

export default function EventAnalyticsTab({
  eventId,
  eventDate,
  requiresPayment,
  defaultPrice,
  capacity,
  registrations
}: EventAnalyticsTabProps) {

  const stats = useMemo(() => {
    const total = registrations.length
    const registered = registrations.filter(r => r.status === 'registered').length
    const attended = registrations.filter(r => r.status === 'attended').length
    const cancelled = registrations.filter(r => r.status === 'cancelled').length
    const noShow = registrations.filter(r => r.status === 'no_show').length

    // Payment stats
    const paid = registrations.filter(r => r.payment_status === 'paid').length
    const pendingPayment = registrations.filter(r => r.payment_status === 'pending').length
    const overduePayment = registrations.filter(r => r.payment_status === 'overdue').length
    const totalRevenue = registrations.reduce((sum, r) => sum + (r.paid_amount || 0), 0)
    const expectedRevenue = registrations
      .filter(r => r.status !== 'cancelled')
      .reduce((sum, r) => sum + (r.price || defaultPrice || 0) * (r.quantity || 1), 0)

    // Event status
    const isPast = eventDate ? new Date(eventDate) < new Date() : false
    
    // Conversion rates
    const activeRegistrations = registered + attended + noShow
    const noShowRate = (attended + noShow) > 0
      ? Math.round((noShow / (attended + noShow)) * 100)
      : null
    const attendanceRate = (attended + noShow) > 0
      ? Math.round((attended / (attended + noShow)) * 100)
      : null
    const cancellationRate = total > 0
      ? Math.round((cancelled / total) * 100)
      : null
    const paymentRate = requiresPayment && activeRegistrations > 0
      ? Math.round((paid / activeRegistrations) * 100)
      : null
    const capacityUsage = capacity
      ? Math.round((activeRegistrations / capacity) * 100)
      : null

    // Registration over time (for simple chart)
    const registrationsByDay = new Map<string, number>()
    registrations
      .filter(r => r.status !== 'cancelled')
      .forEach(r => {
        const day = new Date(r.registered_at).toISOString().split('T')[0]
        registrationsByDay.set(day, (registrationsByDay.get(day) || 0) + 1)
      })

    return {
      total, registered, attended, cancelled, noShow,
      paid, pendingPayment, overduePayment, totalRevenue, expectedRevenue,
      isPast, activeRegistrations,
      noShowRate, attendanceRate, cancellationRate, paymentRate, capacityUsage,
      registrationsByDay
    }
  }, [registrations, eventDate, requiresPayment, defaultPrice, capacity])

  return (
    <div className="space-y-6">
      {/* Main metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Регистрации"
          value={stats.activeRegistrations}
          subtitle={stats.capacityUsage !== null ? `${stats.capacityUsage}% заполненности` : undefined}
          color="blue"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Пришли"
          value={stats.attended}
          subtitle={stats.attendanceRate !== null ? `${stats.attendanceRate}% доходимость` : stats.isPast ? '0%' : 'Событие впереди'}
          color="green"
        />
        <MetricCard
          icon={XCircle}
          label="Не пришли"
          value={stats.noShow}
          subtitle={stats.noShowRate !== null ? `${stats.noShowRate}% no-show` : undefined}
          color="red"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Отмены"
          value={stats.cancelled}
          subtitle={stats.cancellationRate !== null ? `${stats.cancellationRate}% отмен` : undefined}
          color="yellow"
        />
      </div>

      {/* Registration timeline - vertical bars */}
      {stats.registrationsByDay.size > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Динамика регистраций
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const entries = Array.from(stats.registrationsByDay.entries())
                .sort(([a], [b]) => a.localeCompare(b))
              const maxCount = Math.max(...entries.map(([, c]) => c))
              const barHeight = 160 // max bar height in px
              
              return (
                <div className="flex items-end gap-1 sm:gap-2 overflow-x-auto pb-2" style={{ minHeight: barHeight + 40 }}>
                  {entries.map(([day, count]) => {
                    const height = maxCount > 0 ? Math.max((count / maxCount) * barHeight, 20) : 20
                    return (
                      <div key={day} className="flex flex-col items-center flex-shrink-0" style={{ minWidth: entries.length > 14 ? 28 : 40 }}>
                        <span className="text-xs font-medium text-gray-700 mb-1">{count}</span>
                        <div 
                          className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                          style={{ height: `${height}px`, minWidth: entries.length > 14 ? 20 : 28 }}
                          title={`${new Date(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: ${count} рег.`}
                        />
                        <span className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">
                          {new Date(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, subtitle, color }: {
  icon: any
  label: string
  value: number
  subtitle?: string
  color: 'blue' | 'green' | 'red' | 'yellow'
}) {
  const colors = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-500',
    yellow: 'text-yellow-600'
  }

  return (
    <Card>
      <CardContent className="p-4 text-center">
        <Icon className={`h-5 w-5 mx-auto mb-1 ${colors[color]}`} />
        <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
      </CardContent>
    </Card>
  )
}

