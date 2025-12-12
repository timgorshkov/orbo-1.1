'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  Hash,
  Building2,
  Clock,
  Activity
} from 'lucide-react'
import { getActionDescription, getResourceDescription } from '@/lib/auditActionDescriptions'

interface AuditLogEntry {
  id: number
  org_id: string
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  changes?: {
    before?: any
    after?: any
  }
  metadata?: any
  created_at: string
  request_id?: string
  ip_address?: string
  user_agent?: string
  organizations?: {
    name: string
  }
  users?: {
    email: string
  }
}

interface Statistics {
  total: number
  by_action: Record<string, number>
  by_resource: Record<string, number>
}

interface AuditLogData {
  ok: boolean
  logs: AuditLogEntry[]
  statistics: Statistics
  filters: {
    org_id?: string
    user_id?: string
    action?: string
    resource_type?: string
    hours: number
    limit: number
  }
}

export function AuditLog() {
  const [data, setData] = useState<AuditLogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [hoursFilter, setHoursFilter] = useState(168) // Default to week
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [resourceFilter, setResourceFilter] = useState<string>('all')
  
  // Expanded log IDs
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set())

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        hours: hoursFilter.toString(),
        limit: '100'
      })
      
      if (actionFilter !== 'all') {
        params.append('action', actionFilter)
      }
      
      if (resourceFilter !== 'all') {
        params.append('resource_type', resourceFilter)
      }
      
      const res = await fetch(`/api/superadmin/audit-log?${params}`)
      
      if (!res.ok) {
        throw new Error('Не удалось загрузить журнал аудита')
      }
      
      const data = await res.json()
      setData(data)
    } catch (e: any) {
      setError(e.message || 'Не удалось загрузить журнал аудита')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchLogs, 30000)
    return () => clearInterval(interval)
  }, [hoursFilter, actionFilter, resourceFilter])

  const toggleExpanded = (id: number) => {
    setExpandedLogs(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffMins < 1) return 'только что'
    if (diffMins < 60) return `${diffMins} мин. назад`
    if (diffHours < 24) return `${diffHours} ч. назад`
    return `${diffDays} д. назад`
  }

  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Журнал действий админов</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600">Загрузка...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Журнал действий</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={fetchLogs} className="mt-4" size="sm">
            Попробовать снова
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return null
  }

  // Extract unique actions and resources for filters
  const uniqueActions = Object.keys(data.statistics.by_action).sort()
  const uniqueResources = Object.keys(data.statistics.by_resource).sort()

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Всего действий
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.statistics.total}</div>
            <p className="text-xs text-neutral-500">за выбранный период</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Типов действий
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(data.statistics.by_action).length}
            </div>
            <p className="text-xs text-neutral-500">уникальных операций</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Типов ресурсов
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(data.statistics.by_resource).length}
            </div>
            <p className="text-xs text-neutral-500">затронутых объектов</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Фильтры</span>
            <Button 
              onClick={fetchLogs} 
              size="sm" 
              variant="outline"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {/* Time filter */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Период
              </label>
              <select
                value={hoursFilter}
                onChange={(e) => setHoursFilter(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="1">Последний час</option>
                <option value="6">6 часов</option>
                <option value="24">24 часа</option>
                <option value="72">3 дня</option>
                <option value="168">Неделя</option>
                <option value="720">Месяц</option>
              </select>
            </div>
            
            {/* Action filter */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Действие
              </label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="all">Все действия</option>
                {uniqueActions.map(action => (
                  <option key={action} value={action}>
                    {getActionDescription(action)} ({data.statistics.by_action[action]})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Resource filter */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Ресурс
              </label>
              <select
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="all">Все ресурсы</option>
                {uniqueResources.map(resource => (
                  <option key={resource} value={resource}>
                    {getResourceDescription(resource)} ({data.statistics.by_resource[resource]})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Журнал действий ({data.logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.logs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
              <p className="text-sm text-neutral-600">
                Нет действий за выбранный период
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Действия админов будут отображаться здесь
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.logs.map((log) => {
                const isExpanded = expandedLogs.has(log.id)
                
                return (
                  <div
                    key={log.id}
                    className="border rounded-lg overflow-hidden"
                  >
                    {/* Header */}
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              {getActionDescription(log.action)}
                            </Badge>
                            
                            <Badge variant="outline" className="text-xs">
                              {getResourceDescription(log.resource_type)}
                            </Badge>
                            
                            {log.resource_id && (
                              <Badge variant="outline" className="text-xs font-mono bg-neutral-50">
                                <Hash className="h-3 w-3 mr-1" />
                                {log.resource_id.length > 8 ? `${log.resource_id.substring(0, 8)}...` : log.resource_id}
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm mb-1">
                            <span className="font-medium">{log.users?.email || 'Неизвестный пользователь'}</span>
                          </p>
                          
                          <div className="flex items-center gap-4 text-xs text-neutral-500">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {log.organizations?.name || 'Неизвестная орг.'}
                            </span>
                            <span className="flex items-center gap-1" title={formatDate(log.created_at)}>
                              <Clock className="h-3 w-3" />
                              {getTimeAgo(log.created_at)}
                            </span>
                          </div>
                          
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="text-xs text-neutral-600 mt-2 flex flex-wrap gap-2">
                              {Object.entries(log.metadata).slice(0, 3).map(([key, value]) => (
                                <span key={key} className="bg-neutral-100 px-2 py-0.5 rounded">
                                  {key}: {String(value).length > 20 ? `${String(value).substring(0, 20)}...` : String(value)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <Button
                          onClick={() => toggleExpanded(log.id)}
                          size="sm"
                          variant="ghost"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3 border-t pt-3 bg-neutral-50">
                        {log.request_id && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              ID запроса:
                            </p>
                            <p className="text-xs text-neutral-600 font-mono bg-white p-2 rounded border">
                              {log.request_id}
                            </p>
                          </div>
                        )}
                        
                        {log.ip_address && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              IP адрес:
                            </p>
                            <p className="text-xs text-neutral-600 font-mono bg-white p-2 rounded border">
                              {log.ip_address}
                            </p>
                          </div>
                        )}
                        
                        {log.changes && (log.changes.before || log.changes.after) && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Изменения:
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {log.changes.before && (
                                <div>
                                  <p className="text-xs text-neutral-500 mb-1">До:</p>
                                  <pre className="text-xs text-neutral-600 bg-white p-2 rounded overflow-x-auto border">
                                    {JSON.stringify(log.changes.before, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.changes.after && (
                                <div>
                                  <p className="text-xs text-neutral-500 mb-1">После:</p>
                                  <pre className="text-xs text-neutral-600 bg-white p-2 rounded overflow-x-auto border">
                                    {JSON.stringify(log.changes.after, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Дополнительная информация:
                            </p>
                            <pre className="text-xs text-neutral-600 bg-white p-2 rounded overflow-x-auto border">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        <div className="flex gap-4 text-xs text-neutral-500 pt-2 border-t">
                          <span>ID: {log.id}</span>
                          <span>User ID: {log.user_id.slice(0, 8)}...</span>
                          <span>Org ID: {log.org_id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
