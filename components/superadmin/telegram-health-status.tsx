'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

type HealthSummary = {
  total_groups: number
  healthy: number
  unhealthy: number
  overall_status: HealthStatus
}

type HealthData = {
  ok: boolean
  timestamp: string
  summary: HealthSummary
}

export function TelegramHealthStatus() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchHealth()
    // Обновляем каждые 2 минуты
    const interval = setInterval(fetchHealth, 120000)
    return () => clearInterval(interval)
  }, [])

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/telegram/health')
      if (!res.ok) throw new Error('Не удалось получить статус здоровья')
      const data = await res.json()
      setHealth(data)
      setError(null)
    } catch (e: any) {
      console.error('Ошибка получения статуса:', e)
      setError(e.message || 'Не удалось получить статус здоровья')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 animate-spin" />
            Статус Telegram Webhook
          </CardTitle>
        </CardHeader>
      </Card>
    )
  }

  if (error || !health) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-600">
            <AlertCircle className="h-4 w-4" />
            Статус Telegram Webhook
          </CardTitle>
          <p className="text-sm text-red-600 mt-1">
            {error || 'Не удалось получить статус'}
          </p>
        </CardHeader>
      </Card>
    )
  }

  const { summary } = health
  const statusColor = summary.overall_status === 'healthy' 
    ? 'text-green-600' 
    : summary.overall_status === 'degraded'
    ? 'text-yellow-600'
    : 'text-red-600'
  
  const StatusIcon = summary.overall_status === 'healthy' ? CheckCircle : AlertCircle

  return (
    <Card className={`border-2 ${
      summary.overall_status === 'healthy' 
        ? 'border-green-200 bg-green-50' 
        : summary.overall_status === 'degraded'
        ? 'border-yellow-200 bg-yellow-50'
        : 'border-red-200 bg-red-50'
    }`}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-base ${statusColor}`}>
          <StatusIcon className="h-4 w-4" />
          Статус Telegram Webhook
        </CardTitle>
        <p className="text-xs text-neutral-600 mt-1">
          Обновлено: {new Date(health.timestamp).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-bold">{summary.total_groups}</div>
            <div className="text-xs text-neutral-600">Всего групп</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-600">{summary.healthy}</div>
            <div className="text-xs text-neutral-600">Активные</div>
          </div>
          <div>
            <div className="text-xl font-bold text-red-600">{summary.unhealthy}</div>
            <div className="text-xs text-neutral-600">Неактивные</div>
          </div>
        </div>
        
        {summary.unhealthy > 0 && (
          <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs">
            <p className="text-yellow-900">
              ⚠️ В {summary.unhealthy} {summary.unhealthy === 1 ? 'группе' : 'группах'} давно не было сообщений. 
              Это нормально для неактивных групп.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

