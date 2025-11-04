'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export function TelegramHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchHealth()
    // Refresh every 2 minutes
    const interval = setInterval(fetchHealth, 120000)
    return () => clearInterval(interval)
  }, [])

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/telegram/health')
      if (!res.ok) throw new Error('Failed to fetch health status')
      const data = await res.json()
      setHealth(data)
      setError(null)
    } catch (e: any) {
      console.error('Error fetching health:', e)
      setError(e.message || 'Failed to fetch health status')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 animate-spin" />
            Telegram Webhook Status
          </CardTitle>
          <CardDescription>Checking webhook health...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error || !health) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Telegram Webhook Status
          </CardTitle>
          <CardDescription className="text-red-600">
            {error || 'Unable to fetch health status'}
          </CardDescription>
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
        ? 'border-green-200' 
        : summary.overall_status === 'degraded'
        ? 'border-yellow-200'
        : 'border-red-200'
    }`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${statusColor}`}>
          <StatusIcon className="h-5 w-5" />
          Telegram Webhook Status
        </CardTitle>
        <CardDescription>
          Last checked: {new Date(health.timestamp).toLocaleString('ru')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{summary.total_groups}</div>
            <div className="text-sm text-neutral-600">Total Groups</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{summary.healthy}</div>
            <div className="text-sm text-neutral-600">Healthy</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{summary.unhealthy}</div>
            <div className="text-sm text-neutral-600">Unhealthy</div>
          </div>
        </div>
        
        {summary.unhealthy > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">
              ⚠️ {summary.unhealthy} group(s) haven't received messages recently. 
              This is normal for inactive groups.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

