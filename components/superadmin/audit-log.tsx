'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  RefreshCw,
  ChevronDown,
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
        <CardHeader className="py-3">
          <CardTitle className="text-base">
            Журнал действий ({data.logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.logs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
              <p className="text-sm text-neutral-600">
                Нет действий за выбранный период
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {data.logs.map((log) => {
                const isExpanded = expandedLogs.has(log.id)
                const userEmail = log.users?.email && log.users.email !== 'Unknown' 
                  ? log.users.email 
                  : null
                const orgName = log.organizations?.name && log.organizations.name !== 'Unknown'
                  ? log.organizations.name
                  : null
                
                // Фильтруем metadata - убираем tg_chat_id и другие технические поля
                const filteredMetadata = log.metadata ? Object.fromEntries(
                  Object.entries(log.metadata).filter(([key]) => 
                    !['tg_chat_id', 'chat_id'].includes(key)
                  )
                ) : null
                const hasMetadata = filteredMetadata && Object.keys(filteredMetadata).length > 0
                
                return (
                  <div
                    key={log.id}
                    className="hover:bg-neutral-50 transition-colors"
                  >
                    {/* Compact row */}
                    <div 
                      className="px-4 py-2 flex items-center gap-3 cursor-pointer"
                      onClick={() => toggleExpanded(log.id)}
                    >
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                          {getActionDescription(log.action)}
                        </Badge>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {getResourceDescription(log.resource_type)}
                        </Badge>
                      </div>
                      
                      <div className="flex-1 min-w-0 flex items-center gap-3 text-sm">
                        {userEmail && (
                          <span className="font-medium text-neutral-900 truncate max-w-[200px]" title={userEmail}>
                            {userEmail}
                          </span>
                        )}
                        {orgName && (
                          <span className="text-neutral-500 truncate max-w-[150px]" title={orgName}>
                            {orgName}
                          </span>
                        )}
                      </div>
                      
                      <span className="text-xs text-neutral-400 flex-shrink-0" title={formatDate(log.created_at)}>
                        {getTimeAgo(log.created_at)}
                      </span>
                      
                      <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                    
                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 bg-neutral-50 border-t text-xs space-y-2">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-neutral-600">
                          <span><strong>Время:</strong> {formatDate(log.created_at)}</span>
                          {userEmail && <span><strong>Email:</strong> {userEmail}</span>}
                          {orgName && <span><strong>Организация:</strong> {orgName}</span>}
                          {log.resource_id && <span><strong>Resource ID:</strong> <code className="bg-white px-1 rounded">{log.resource_id}</code></span>}
                        </div>
                        
                        {log.request_id && (
                          <div className="text-neutral-600">
                            <strong>Request ID:</strong> <code className="bg-white px-1 rounded">{log.request_id}</code>
                          </div>
                        )}
                        
                        {log.ip_address && (
                          <div className="text-neutral-600">
                            <strong>IP:</strong> {log.ip_address}
                          </div>
                        )}
                        
                        {log.changes && (log.changes.before || log.changes.after) && (
                          <div>
                            <strong className="text-neutral-700">Изменения:</strong>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              {log.changes.before && (
                                <div>
                                  <span className="text-neutral-500">До:</span>
                                  <pre className="text-neutral-600 bg-white p-2 rounded overflow-x-auto border mt-1 text-xs">
                                    {JSON.stringify(log.changes.before, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.changes.after && (
                                <div>
                                  <span className="text-neutral-500">После:</span>
                                  <pre className="text-neutral-600 bg-white p-2 rounded overflow-x-auto border mt-1 text-xs">
                                    {JSON.stringify(log.changes.after, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {hasMetadata && (
                          <div>
                            <strong className="text-neutral-700">Метаданные:</strong>
                            <pre className="text-neutral-600 bg-white p-2 rounded overflow-x-auto border mt-1 text-xs">
                              {JSON.stringify(filteredMetadata, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        <div className="flex gap-4 text-neutral-400 pt-1 border-t border-neutral-200">
                          <span>Log ID: {log.id}</span>
                          <span>User: {log.user_id}</span>
                          <span>Org: {log.org_id}</span>
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
