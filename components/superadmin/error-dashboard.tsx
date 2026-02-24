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
  ChevronUp,
  Lightbulb,
  Clock,
  User,
  Building2,
  ExternalLink
} from 'lucide-react'
import { getErrorCodeInfo, getSeverityColor, getSeverityLabel, type ErrorCodeInfo } from '@/lib/errorCodes'

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
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  
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
        throw new Error('Не удалось загрузить ошибки')
      }
      
      const data = await res.json()
      setData(data)
    } catch (e: any) {
      setError(e.message || 'Не удалось загрузить ошибки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchErrors()
    
    // Автообновление каждые 2 минуты
    const interval = setInterval(fetchErrors, 120000)
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
        throw new Error('Не удалось отметить как решённое')
      }
      
      fetchErrors()
    } catch (e) {
      console.error('Failed to mark error as resolved:', e)
    }
  }

  // Get unique categories from errors
  const categories = data?.errors 
    ? Array.from(new Set(data.errors.map(e => getErrorCodeInfo(e.error_code || '').category)))
    : []

  // Filter errors by category, then deduplicate by fingerprint (show latest + count)
  const filteredErrors = (() => {
    const catFiltered = data?.errors.filter(e => {
      if (categoryFilter === 'all') return true
      return getErrorCodeInfo(e.error_code || '').category === categoryFilter
    }) || []

    const seen = new Map<string, { entry: ErrorLog; count: number }>()
    for (const err of catFiltered) {
      const key = err.fingerprint || `${err.error_code}_${err.message}`
      const existing = seen.get(key)
      if (existing) {
        existing.count++
        if (new Date(err.created_at) > new Date(existing.entry.created_at)) {
          existing.entry = err
        }
      } else {
        seen.set(key, { entry: err, count: 1 })
      }
    }
    return Array.from(seen.values())
  })()

  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Мониторинг ошибок</CardTitle>
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
          <CardTitle className="text-red-600">Мониторинг ошибок</CardTitle>
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

  const getLevelLabel = (level: ErrorLevel) => {
    switch (level) {
      case 'error': return 'Ошибка'
      case 'warn': return 'Предупреждение'
      case 'info': return 'Информация'
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

  return (
    <div className="space-y-4">
      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600">
              Всего
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.statistics.total}</div>
            <p className="text-xs text-neutral-500">за {hoursFilter}ч</p>
          </CardContent>
        </Card>
        
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              Ошибки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {data.statistics.error}
            </div>
            <p className="text-xs text-red-500">требуют исправления</p>
          </CardContent>
        </Card>
        
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">
              Предупреждения
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {data.statistics.warn}
            </div>
            <p className="text-xs text-yellow-600">требуют анализа</p>
          </CardContent>
        </Card>
        
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">
              Информация
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {data.statistics.info}
            </div>
            <p className="text-xs text-blue-500">для мониторинга</p>
          </CardContent>
        </Card>
      </div>

      {/* Фильтры */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Фильтры</span>
            <Button 
              onClick={fetchErrors} 
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
            {/* Фильтр по уровню */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Уровень
              </label>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as any)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="all">Все</option>
                <option value="error">Ошибки</option>
                <option value="warn">Предупреждения</option>
                <option value="info">Информация</option>
              </select>
            </div>
            
            {/* Фильтр по времени */}
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
              </select>
            </div>
            
            {/* Фильтр по категории */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1 block">
                Категория
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                <option value="all">Все категории</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Список ошибок */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Журнал ({filteredErrors.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredErrors.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <p className="text-sm text-neutral-600">
                Нет записей за выбранный период
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Это хорошо! Система работает стабильно
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredErrors.map(({ entry: err, count }) => {
                const isExpanded = expandedErrors.has(err.id)
                const codeInfo = getErrorCodeInfo(err.error_code || '')
                
                return (
                  <div
                    key={err.id}
                    className={`border rounded-lg overflow-hidden ${
                      err.resolved_at ? 'bg-neutral-50 opacity-60' : ''
                    } ${err.level === 'error' ? 'border-red-200' : err.level === 'warn' ? 'border-yellow-200' : 'border-neutral-200'}`}
                  >
                    {/* Header */}
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {getLevelIcon(err.level)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getLevelColor(err.level)}`}
                            >
                              {getLevelLabel(err.level)}
                            </Badge>
                            
                            {err.error_code && (
                              <Badge variant="outline" className="text-xs font-mono">
                                {err.error_code}
                              </Badge>
                            )}
                            
                            {count > 1 && (
                              <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600">
                                ×{count}
                              </Badge>
                            )}
                            
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getSeverityColor(codeInfo.severity)}`}
                            >
                              {getSeverityLabel(codeInfo.severity)}
                            </Badge>
                            
                            {err.resolved_at && (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                ✓ Решено
                              </Badge>
                            )}
                          </div>
                          
                          {/* Описание ошибки */}
                          <p className="text-sm font-medium mb-1">
                            {codeInfo.description !== 'Неизвестный код ошибки' 
                              ? codeInfo.description 
                              : err.message}
                          </p>
                          
                          {/* Категория и время */}
                          <div className="flex items-center gap-4 text-xs text-neutral-500">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {codeInfo.category}
                            </span>
                            <span className="flex items-center gap-1" title={formatDate(err.created_at)}>
                              <Clock className="h-3 w-3" />
                              {getTimeAgo(err.created_at)}
                            </span>
                            {err.org_id && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                Орг: {err.org_id.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          {!err.resolved_at && (
                            <Button
                              onClick={() => markAsResolved(err.id)}
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Решено
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
                    </div>
                    
                    {/* Рекомендация (всегда видна) */}
                    {codeInfo.recommendation && (
                      <div className="px-3 pb-3">
                        <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-md border border-amber-200">
                          <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-amber-800">Рекомендация:</p>
                            <p className="text-xs text-amber-700">{codeInfo.recommendation}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3 border-t pt-3 bg-neutral-50">
                        {/* Оригинальное сообщение */}
                        {err.message && codeInfo.description !== err.message && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Оригинальное сообщение:
                            </p>
                            <p className="text-xs text-neutral-600 bg-white p-2 rounded border font-mono">
                              {err.message}
                            </p>
                          </div>
                        )}
                        
                        {err.request_id && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              ID запроса:
                            </p>
                            <p className="text-xs text-neutral-600 font-mono bg-white p-2 rounded border">
                              {err.request_id}
                            </p>
                          </div>
                        )}
                        
                        {err.context && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Контекст:
                            </p>
                            <pre className="text-xs text-neutral-600 bg-white p-2 rounded overflow-x-auto border">
                              {JSON.stringify(err.context, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {err.stack_trace && (
                          <div>
                            <p className="text-xs font-medium text-neutral-700 mb-1">
                              Stack Trace:
                            </p>
                            <pre className="text-xs text-neutral-600 bg-white p-2 rounded overflow-x-auto max-h-48 border">
                              {err.stack_trace}
                            </pre>
                          </div>
                        )}
                        
                        <div className="flex gap-4 text-xs text-neutral-500 pt-2 border-t">
                          <span>ID: {err.id}</span>
                          <span>Fingerprint: {err.fingerprint?.slice(0, 8)}...</span>
                          {err.user_id && <span>User: {err.user_id.slice(0, 8)}...</span>}
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
