'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

type ErrorLevel = 'error' | 'warn' | 'info'

interface ErrorLog {
  id: number
  org_id?: string
  user_id?: string
  level: ErrorLevel
  message: string
  error_code?: string
  context?: any
  stack_trace?: string
  fingerprint?: string
  created_at: string
  resolved_at?: string
  request_id?: string
  user_agent?: string
}

interface Statistics {
  total: number
  error: number
  warn: number
  info: number
}

interface ErrorDashboardData {
  ok: boolean
  errors: ErrorLog[]
  statistics: Statistics
  filters: {
    level?: string
    hours: number
    limit: number
    error_code?: string
  }
}

export function ErrorDashboard() {
  const [data, setData] = useState<ErrorDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [levelFilter, setLevelFilter] = useState<ErrorLevel | 'all'>('all')
  const [hoursFilter, setHoursFilter] = useState(24)
  
  // Expanded error IDs
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())

  const fetchErrors = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        hours: hoursFilter.toString(),
        limit: '100'
      })
      
      if (levelFilter !== 'all') {
        params.append('level', levelFilter)
      }
      
      const res = await fetch(`/api/superadmin/errors?${params}`)
      
      if (!res.ok) {
        throw new Error('Failed to fetch errors')
      }
      
      const data = await res.json()
      setData(data)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch errors')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchErrors()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchErrors, 30000)
    return () => clearInterval(interval)
  }, [levelFilter, hoursFilter])

  const toggleExpanded = (id: number) => {
    setExpandedErrors(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const markAsResolved = async (id: number) => {
    try {
      const res = await fetch(`/api/superadmin/errors`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved: true })
      })
      
      if (!res.ok) {
        throw new Error('Failed to mark as resolved')
      }
      
      // Refresh data
      fetchErrors()
    } catch (e) {
      console.error('Failed to mark error as resolved:', e)
    }
  }

  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error Dashboard</CardTitle>
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
          <CardTitle className="text-red-600">Error Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={fetchErrors} className="mt-4" size="sm">
            Попробовать снова
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return null
  }

  const getLevelIcon = (level: ErrorLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'info':
        return <Info className="h-4 w-4 text-blue-600" />
    }
  }

  const getLevelColor = (level: ErrorLevel) => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'warn':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.statistics.total}</div>
          </CardContent>
        </Card>
        
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {data.statistics.error}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {data.statistics.warn}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">
              Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {data.statistics.info}
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
              onClick={fetchErrors} 
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
            {/* Level filter */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Level
              </label>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as any)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="all">All</option>
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            
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
          </div>
        </CardContent>
      </Card>

      {/* Error logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Error Logs ({data.errors.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.errors.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-600">
                No errors in the selected time range
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.errors.map((err) => {
                const isExpanded = expandedErrors.has(err.id)
                
                return (
                  <div
                    key={err.id}
                    className={`border rounded-lg p-3 ${
                      err.resolved_at ? 'bg-neutral-50 opacity-60' : ''
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getLevelIcon(err.level)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getLevelColor(err.level)}`}
                          >
                            {err.level.toUpperCase()}
                          </Badge>
                          
                          {err.error_code && (
                            <Badge variant="outline" className="text-xs">
                              {err.error_code}
                            </Badge>
                          )}
                          
                          {err.resolved_at && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              Resolved
                            </Badge>
                          )}
                          
                          <span className="text-xs text-neutral-500">
                            {new Date(err.created_at).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        
                        <p className="text-sm font-medium mb-1">
                          {err.message}
                        </p>
                        
                        {err.context?.service && (
                          <p className="text-xs text-neutral-600">
                            Service: {err.context.service}
                          </p>
                        )}
                        
                        {err.context?.webhook && (
                          <p className="text-xs text-neutral-600">
                            Webhook: {err.context.webhook}
                          </p>
                        )}
                        
                        {err.context?.cron && (
                          <p className="text-xs text-neutral-600">
                            Cron: {err.context.cron}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        {!err.resolved_at && (
                          <Button
                            onClick={() => markAsResolved(err.id)}
                            size="sm"
                            variant="outline"
                            className="text-xs"
                          >
                            Resolve
                          </Button>
                        )}
                        
                        <Button
                          onClick={() => toggleExpanded(err.id)}
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
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {err.request_id && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Request ID:
                            </p>
                            <p className="text-xs text-neutral-600 font-mono">
                              {err.request_id}
                            </p>
                          </div>
                        )}
                        
                        {err.context && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Context:
                            </p>
                            <pre className="text-xs text-neutral-600 bg-neutral-100 p-2 rounded overflow-x-auto">
                              {JSON.stringify(err.context, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {err.stack_trace && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Stack Trace:
                            </p>
                            <pre className="text-xs text-neutral-600 bg-neutral-100 p-2 rounded overflow-x-auto max-h-48">
                              {err.stack_trace}
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

