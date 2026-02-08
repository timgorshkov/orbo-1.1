'use client'

import { useState, useEffect } from 'react'
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Bell, 
  Clock, 
  Zap,
  Bot,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface HealthData {
  status: 'healthy' | 'degraded' | 'critical' | 'error'
  health_score: number
  issues: string[]
  cron: {
    last_run: string | null
    last_run_ago_minutes: number | null
    recently_checked_rules: Array<{
      id: string
      name: string
      type: string
      last_check: string
    }>
  }
  notifications_24h: {
    sent: number
    failed: number
    total: number
  }
  rules: {
    enabled_total: number
    stalled: Array<{
      id: string
      name: string
      type: string
      last_check: string | null
    }>
  }
  bot: {
    token_configured: boolean
  }
  recent_logs: Array<{
    id: string
    type: string
    status: string
    created_at: string
    error: string | null
    recipients_count: number
  }>
  checked_at: string
  error?: string
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    healthy: { icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200', label: 'Healthy' },
    degraded: { icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-50 border-yellow-200', label: 'Degraded' },
    critical: { icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200', label: 'Critical' },
    error: { icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200', label: 'Error' },
  }[status] || { icon: Activity, color: 'text-gray-600 bg-gray-50 border-gray-200', label: status }

  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${config.color}`}>
      <Icon className="h-4 w-4" />
      {config.label}
    </span>
  )
}

function HealthScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-bold text-gray-700 w-12 text-right">{score}%</span>
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин. назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч. назад`
  const days = Math.floor(hours / 24)
  return `${days} дн. назад`
}

export function NotificationHealth() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [showStalled, setShowStalled] = useState(false)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/notification-health')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch health data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="h-5 w-5 text-gray-400 animate-pulse" />
          <h2 className="text-lg font-semibold text-gray-900">Notification System Health</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">Notification System Health</h2>
          </div>
          <button 
            onClick={fetchHealth}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <p className="text-red-600 text-sm">Error: {error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Notification System Health</h2>
          <StatusBadge status={data.status} />
        </div>
        <button 
          onClick={fetchHealth}
          disabled={loading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Health Score */}
      <div>
        <div className="text-xs text-gray-500 mb-1 font-medium">Health Score</div>
        <HealthScoreBar score={data.health_score} />
      </div>

      {/* Issues */}
      {data.issues.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-800 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Обнаружены проблемы ({data.issues.length})
          </h3>
          <ul className="space-y-1">
            {data.issues.map((issue, i) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Cron Status */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-500">Последний cron</span>
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {data.cron.last_run 
              ? formatTimeAgo(data.cron.last_run) 
              : <span className="text-red-500">Никогда</span>
            }
          </div>
        </div>

        {/* Sent 24h */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Bell className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-500">Отправлено 24ч</span>
          </div>
          <div className="text-sm font-semibold text-green-600">
            {data.notifications_24h.sent}
          </div>
        </div>

        {/* Failed 24h */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-500">Ошибки 24ч</span>
          </div>
          <div className={`text-sm font-semibold ${data.notifications_24h.failed > 0 ? 'text-red-600' : 'text-gray-600'}`}>
            {data.notifications_24h.failed}
          </div>
        </div>

        {/* Bot */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-500">Бот</span>
          </div>
          <div className="text-sm font-semibold">
            {data.bot.token_configured 
              ? <span className="text-green-600">Настроен</span>
              : <span className="text-red-600">Не настроен</span>
            }
          </div>
        </div>
      </div>

      {/* Rules Info */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          Активных правил: <span className="font-medium text-gray-900">{data.rules.enabled_total}</span>
        </span>
        {data.rules.stalled.length > 0 && (
          <button 
            onClick={() => setShowStalled(!showStalled)}
            className="flex items-center gap-1 text-yellow-600 hover:text-yellow-700"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {data.rules.stalled.length} правил не проверялись 2+ ч.
            {showStalled ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Stalled Rules Details */}
      {showStalled && data.rules.stalled.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="space-y-2">
            {data.rules.stalled.map(rule => (
              <div key={rule.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{rule.name}</span>
                  <span className="text-xs text-gray-500 ml-2">({rule.type})</span>
                </div>
                <span className="text-xs text-gray-500">
                  {rule.last_check ? formatTimeAgo(rule.last_check) : 'никогда'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Logs Toggle */}
      <div>
        <button 
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition"
        >
          {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Последние логи ({data.recent_logs.length})
        </button>
        
        {showLogs && data.recent_logs.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Тип</th>
                  <th className="text-left px-3 py-2 font-medium">Статус</th>
                  <th className="text-left px-3 py-2 font-medium">Получатели</th>
                  <th className="text-left px-3 py-2 font-medium">Когда</th>
                  <th className="text-left px-3 py-2 font-medium">Ошибка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recent_logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900 font-medium">{log.type}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        log.status === 'sent' ? 'bg-green-100 text-green-700' :
                        log.status === 'failed' ? 'bg-red-100 text-red-700' :
                        log.status === 'skipped' ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{log.recipients_count}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{formatTimeAgo(log.created_at)}</td>
                    <td className="px-3 py-2 text-red-600 text-xs truncate max-w-[200px]">{log.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showLogs && data.recent_logs.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">Нет логов за последние 24 часа</p>
        )}
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
        Последняя проверка: {new Date(data.checked_at).toLocaleString('ru')}
      </div>
    </div>
  )
}
