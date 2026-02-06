'use client'

import { useMemo } from 'react'
import { BarChart3, TrendingUp, Users, CreditCard, AlertTriangle, CheckCircle2, XCircle, UserCheck } from 'lucide-react'
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

      {/* Payment metrics (if applicable) */}
      {requiresPayment && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Финансы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {stats.totalRevenue.toLocaleString('ru-RU')} ₽
                </div>
                <div className="text-xs text-gray-500">Получено</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-400">
                  {stats.expectedRevenue.toLocaleString('ru-RU')} ₽
                </div>
                <div className="text-xs text-gray-500">Ожидается</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.paid}</div>
                <div className="text-xs text-gray-500">Оплатили</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{stats.pendingPayment + stats.overduePayment}</div>
                <div className="text-xs text-gray-500">Ожидают оплаты</div>
              </div>
            </div>
            {stats.paymentRate !== null && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Конверсия в оплату</span>
                  <span>{stats.paymentRate}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min(stats.paymentRate, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Воронка события
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <FunnelRow 
              label="Зарегистрировались" 
              value={stats.activeRegistrations} 
              total={stats.activeRegistrations} 
              color="bg-blue-500" 
            />
            {requiresPayment && (
              <FunnelRow 
                label="Оплатили" 
                value={stats.paid} 
                total={stats.activeRegistrations} 
                color="bg-indigo-500" 
              />
            )}
            {stats.isPast && (
              <>
                <FunnelRow 
                  label="Пришли (check-in)" 
                  value={stats.attended} 
                  total={stats.activeRegistrations} 
                  color="bg-green-500" 
                />
                <FunnelRow 
                  label="Не пришли" 
                  value={stats.noShow} 
                  total={stats.activeRegistrations} 
                  color="bg-red-400" 
                />
              </>
            )}
            <FunnelRow 
              label="Отменили" 
              value={stats.cancelled} 
              total={stats.total} 
              color="bg-gray-400" 
            />
          </div>
        </CardContent>
      </Card>

      {/* Registration timeline */}
      {stats.registrationsByDay.size > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Динамика регистраций
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from(stats.registrationsByDay.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, count]) => {
                  const maxCount = Math.max(...Array.from(stats.registrationsByDay.values()))
                  const width = maxCount > 0 ? (count / maxCount) * 100 : 0
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 flex-shrink-0">
                        {new Date(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4">
                        <div
                          className="bg-blue-500 h-4 rounded-full transition-all flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(width, 10)}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">{count}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
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

function FunnelRow({ label, value, total, color }: {
  label: string
  value: number
  total: number
  color: string
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-medium text-gray-900">{value} <span className="text-gray-400 text-xs">({percent}%)</span></span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div 
          className={`${color} h-2.5 rounded-full transition-all`} 
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  )
}
