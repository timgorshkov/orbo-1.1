'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

type GlobalStatus = {
  status: HealthStatus
  last_event_at: string | null
  last_event_from_group: {
    title: string
    tg_chat_id: number
  } | null
  minutes_since_last_event: number | null
  active_groups_24h: number
  total_groups: number
}

type HealthData = {
  ok: boolean
  timestamp: string
  global_status: GlobalStatus
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
      console.log('[TelegramHealthStatus] Fetching health data...')
      const res = await fetch('/api/telegram/health')
      console.log('[TelegramHealthStatus] Response status:', res.status)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error('[TelegramHealthStatus] Response not OK:', errorText)
        throw new Error('Не удалось получить статус здоровья')
      }
      
      const data = await res.json()
      console.log('[TelegramHealthStatus] Data received:', data)
      
      // Validate data structure
      if (!data || !data.global_status) {
        console.error('[TelegramHealthStatus] Invalid data structure:', data)
        throw new Error('Получены некорректные данные')
      }
      
      setHealth(data)
      setError(null)
      console.log('[TelegramHealthStatus] Health state updated successfully')
    } catch (e: any) {
      console.error('[TelegramHealthStatus] Error:', e)
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

  // Debug logging
  console.log('[TelegramHealthStatus] Rendering with health:', health)
  
  const { global_status } = health
  
  // Additional validation
  if (!global_status) {
    console.error('[TelegramHealthStatus] Global status is missing:', health)
    return (
      <Card className="border-yellow-200">
        <CardHeader>
          <CardTitle>Статус Telegram Webhook</CardTitle>
          <p className="text-sm text-yellow-600 mt-1">
            Данные получены, но структура некорректна. Check console for details.
          </p>
        </CardHeader>
      </Card>
    )
  }
  
  const statusColor = global_status.status === 'healthy' 
    ? 'text-green-600' 
    : global_status.status === 'degraded'
    ? 'text-yellow-600'
    : 'text-red-600'
  
  const StatusIcon = global_status.status === 'healthy' ? CheckCircle : AlertCircle
  
  // Status message
  const getStatusMessage = () => {
    if (global_status.status === 'healthy') {
      return 'Webhook работает корректно';
    } else if (global_status.status === 'degraded') {
      return 'Webhook работает, но давно не было событий';
    } else if (global_status.status === 'unhealthy') {
      return 'Возможен технический сбой webhook';
    }
    return 'Статус неизвестен';
  }
  
  // Format time
  const formatTimeAgo = (minutes: number | null) => {
    if (minutes === null) return 'никогда';
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  }

  return (
    <Card className={`border-2 ${
      global_status.status === 'healthy' 
        ? 'border-green-200 bg-green-50' 
        : global_status.status === 'degraded'
        ? 'border-yellow-200 bg-yellow-50'
        : 'border-red-200 bg-red-50'
    }`}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-base ${statusColor}`}>
          <StatusIcon className="h-4 w-4" />
          {getStatusMessage()}
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
        <div className="space-y-3">
          {/* Last event info */}
          <div className="text-sm">
            <span className="font-medium text-neutral-700">Последнее событие:</span>{' '}
            <span className={statusColor}>
              {formatTimeAgo(global_status.minutes_since_last_event)}
            </span>
            {global_status.last_event_from_group && (
              <div className="text-xs text-neutral-600 mt-1">
                Группа: {global_status.last_event_from_group.title}
              </div>
            )}
          </div>
          
          {/* Active groups */}
          <div className="text-sm">
            <span className="font-medium text-neutral-700">Активных групп за 24 часа:</span>{' '}
            <span className="font-semibold">
              {global_status.active_groups_24h} из {global_status.total_groups}
            </span>
          </div>
        </div>
        
        {/* Info message */}
        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
          <p className="text-blue-900">
            ℹ️ Для многих групп молчание 1-2 дня — норма. 
            Мониторинг показывает только технические сбои webhook.
          </p>
        </div>
        
        {/* Warning for unhealthy */}
        {global_status.status === 'unhealthy' && (
          <div className="mt-3 p-2 bg-red-50 border border-red-300 rounded text-xs">
            <p className="text-red-900">
              ⚠️ Нет событий более 3 часов. Проверьте webhook настройки в Telegram.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

