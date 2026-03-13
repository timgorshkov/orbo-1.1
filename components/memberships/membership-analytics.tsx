'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Users, TrendingUp, TrendingDown, DollarSign, UserPlus, UserMinus } from 'lucide-react'

interface AnalyticsData {
  statusCounts: Record<string, number>
  totalActive: number
  totalMembers: number
  mrr: number
  revenueThisMonth: number
  totalRevenue: number
  newThisMonth: number
  churnedThisMonth: number
  churnRate: number
}

interface MembershipAnalyticsProps {
  orgId: string
}

export function MembershipAnalytics({ orgId }: MembershipAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/membership-analytics?orgId=${orgId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orgId])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) return null

  const metrics = [
    {
      label: 'Активных участников',
      value: data.totalActive,
      icon: Users,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'MRR',
      value: `${data.mrr.toLocaleString('ru-RU')} ₽`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Новых за месяц',
      value: data.newThisMonth,
      icon: UserPlus,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: 'Отток',
      value: `${data.churnRate}%`,
      icon: data.churnRate > 10 ? TrendingDown : UserMinus,
      color: data.churnRate > 10 ? 'text-red-600' : 'text-gray-600',
      bg: data.churnRate > 10 ? 'bg-red-50' : 'bg-gray-50',
    },
  ]

  return (
    <div className="space-y-4 mb-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(m => (
          <Card key={m.label}>
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${m.bg}`}>
                  <m.icon className={`h-5 w-5 ${m.color}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{m.value}</div>
                  <div className="text-xs text-gray-500">{m.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(data.statusCounts).map(([status, count]) => {
          const colors: Record<string, string> = {
            active: 'bg-emerald-100 text-emerald-800',
            trial: 'bg-blue-100 text-blue-800',
            pending: 'bg-yellow-100 text-yellow-800',
            expired: 'bg-red-100 text-red-800',
            cancelled: 'bg-gray-100 text-gray-600',
            suspended: 'bg-orange-100 text-orange-800',
          }
          const labels: Record<string, string> = {
            active: 'Активные', trial: 'Пробные', pending: 'Ожидают',
            expired: 'Истекшие', cancelled: 'Отменённые', suspended: 'Приостановленные',
          }
          return (
            <span key={status} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
              {labels[status] || status}: {count}
            </span>
          )
        })}
      </div>

      {/* Revenue info */}
      {data.totalRevenue > 0 && (
        <div className="flex gap-4 text-sm text-gray-600">
          <span>Выручка за месяц: <strong>{data.revenueThisMonth.toLocaleString('ru-RU')} ₽</strong></span>
          <span>Всего: <strong>{data.totalRevenue.toLocaleString('ru-RU')} ₽</strong></span>
        </div>
      )}
    </div>
  )
}
