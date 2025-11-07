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
  Hash
} from 'lucide-react'

interface AuditLog {
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
  logs: AuditLog[]
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
  const [hoursFilter, setHoursFilter] = useState(24)
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
        throw new Error('Failed to fetch audit logs')
      }
      
      const data = await res.json()
      setData(data)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch audit logs')
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

  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin Action Audit Log</CardTitle>
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
          <CardTitle className="text-red-600">Admin Action Audit Log</CardTitle>
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

  // Format action name for display
  const formatAction = (action: string) => {
    return action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Total Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.statistics.total}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Action Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(data.statistics.by_action).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Resource Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(data.statistics.by_resource).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Filters</span>
            <Button 
              onClick={fetchLogs} 
              size="sm" 
              variant="outline"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {/* Time filter */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Time Range
              </label>
              <select
                value={hoursFilter}
                onChange={(e) => setHoursFilter(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="1">Last hour</option>
                <option value="6">Last 6 hours</option>
                <option value="24">Last 24 hours</option>
                <option value="72">Last 3 days</option>
                <option value="168">Last week</option>
              </select>
            </div>
            
            {/* Action filter */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Action Type
              </label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="all">All Actions</option>
                {uniqueActions.map(action => (
                  <option key={action} value={action}>
                    {formatAction(action)} ({data.statistics.by_action[action]})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Resource filter */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Resource Type
              </label>
              <select
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="all">All Resources</option>
                {uniqueResources.map(resource => (
                  <option key={resource} value={resource}>
                    {formatAction(resource)} ({data.statistics.by_resource[resource]})
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
            Audit Logs ({data.logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.logs.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
              <p className="text-sm text-neutral-600">
                No actions in the selected time range
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.logs.map((log) => {
                const isExpanded = expandedLogs.has(log.id)
                
                return (
                  <div
                    key={log.id}
                    className="border rounded-lg p-3"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {formatAction(log.action)}
                          </Badge>
                          
                          <Badge variant="outline" className="text-xs">
                            {formatAction(log.resource_type)}
                          </Badge>
                          
                          {log.resource_id && (
                            <Badge variant="outline" className="text-xs font-mono">
                              <Hash className="h-3 w-3 mr-1" />
                              {log.resource_id.substring(0, 8)}...
                            </Badge>
                          )}
                          
                          <span className="text-xs text-neutral-500">
                            {new Date(log.created_at).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        
                        <p className="text-sm mb-1">
                          <span className="font-medium">{log.users?.email || 'Unknown user'}</span>
                          {' → '}
                          <span className="text-neutral-600">
                            {log.organizations?.name || 'Unknown org'}
                          </span>
                        </p>
                        
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="text-xs text-neutral-600 mt-1">
                            {Object.entries(log.metadata).slice(0, 2).map(([key, value]) => (
                              <span key={key} className="mr-3">
                                {key}: {String(value)}
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
                    
                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {log.request_id && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Request ID:
                            </p>
                            <p className="text-xs text-neutral-600 font-mono">
                              {log.request_id}
                            </p>
                          </div>
                        )}
                        
                        {log.ip_address && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              IP Address:
                            </p>
                            <p className="text-xs text-neutral-600 font-mono">
                              {log.ip_address}
                            </p>
                          </div>
                        )}
                        
                        {log.changes && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Changes:
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {log.changes.before && (
                                <div>
                                  <p className="text-xs text-neutral-500 mb-1">Before:</p>
                                  <pre className="text-xs text-neutral-600 bg-neutral-100 p-2 rounded overflow-x-auto">
                                    {JSON.stringify(log.changes.before, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.changes.after && (
                                <div>
                                  <p className="text-xs text-neutral-500 mb-1">After:</p>
                                  <pre className="text-xs text-neutral-600 bg-neutral-100 p-2 rounded overflow-x-auto">
                                    {JSON.stringify(log.changes.after, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {log.metadata && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Metadata:
                            </p>
                            <pre className="text-xs text-neutral-600 bg-neutral-100 p-2 rounded overflow-x-auto">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
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

