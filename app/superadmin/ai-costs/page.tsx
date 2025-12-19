'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { createClientBrowser } from '@/lib/client/supabaseClient'
import { createClientLogger } from '@/lib/logger'

interface CostSummary {
  total_requests: number;
  total_tokens: number;
  total_cost_usd: number;
  total_cost_rub: number;
  avg_cost_per_request_usd: number;
  by_request_type: Record<string, {
    requests: number;
    tokens: number;
    cost_usd: number;
    cost_rub: number;
  }>;
}

interface RecentLog {
  id: number;
  org_id: string;
  request_type: string;
  model: string;
  total_tokens: number;
  cost_usd: number;
  cost_rub: number;
  created_at: string;
  created_by: string | null;
  metadata: any;
}

interface DiagnosticsStatus {
  status: string;
  issues: string[];
  recommendations: string[];
}

interface OpenAIStatus {
  config: {
    openai_api_key: { set: boolean; prefix: string | null };
    openai_proxy_url: { set: boolean; host: string | null };
  };
  logs: {
    recent: { count: number; lastLog: string | null };
    last30Days: number;
  };
  diagnostics: DiagnosticsStatus;
}

export default function AICoststPage() {
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [daysFilter, setDaysFilter] = useState(30)
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    loadOpenAIStatus()
  }, [daysFilter])

  async function loadOpenAIStatus() {
    try {
      const res = await fetch('/api/superadmin/openai-status')
      if (res.ok) {
        const data = await res.json()
        setOpenaiStatus(data)
      } else {
        setStatusError('Failed to load OpenAI status')
      }
    } catch (err) {
      setStatusError('Failed to load OpenAI status')
    }
  }

  async function loadData() {
    setLoading(true)
    const supabase = createClientBrowser()
    
    // Fetch summary
    const { data: summaryData, error: summaryError } = await supabase
      .rpc('get_openai_cost_summary', { p_org_id: null, p_days: daysFilter })
      .single()
    
    const logger = createClientLogger('AICostsPage');
    if (summaryError) {
      logger.error({
        error: summaryError.message,
        error_code: summaryError.code,
        days_filter: daysFilter
      }, 'Error loading summary');
    } else {
      setSummary(summaryData as CostSummary)
    }
    
    // Fetch recent logs via RPC (bypasses RLS issues)
    const { data: logsData, error: logsError } = await supabase
      .rpc('get_openai_api_logs', { p_org_id: null, p_limit: 50 })
    
    if (logsError) {
      logger.error({
        error: logsError.message,
        error_code: logsError.code
      }, 'Error loading logs');
    } else {
      setRecentLogs(logsData || [])
    }
    
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8">Загрузка...</div>
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Расходы (OpenAI API)</h1>
        <p className="text-gray-600 mt-2">
          Мониторинг расходов на OpenAI API по всем организациям
        </p>
      </div>

      {/* OpenAI Status Banner */}
      {openaiStatus && openaiStatus.diagnostics.status !== 'ok' && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-800 flex items-center gap-2">
              ⚠️ Проблемы с конфигурацией OpenAI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {openaiStatus.diagnostics.issues.map((issue, idx) => (
                <div key={idx} className="text-red-700 text-sm">• {issue}</div>
              ))}
              {openaiStatus.diagnostics.recommendations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="text-sm font-medium text-amber-800 mb-1">Рекомендации:</p>
                  {openaiStatus.diagnostics.recommendations.map((rec, idx) => (
                    <div key={idx} className="text-amber-700 text-sm">→ {rec}</div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-amber-200 text-xs text-gray-600">
                <p>API Key: {openaiStatus.config.openai_api_key.set ? `✅ ${openaiStatus.config.openai_api_key.prefix}` : '❌ Не установлен'}</p>
                <p>Proxy: {openaiStatus.config.openai_proxy_url.set ? `✅ ${openaiStatus.config.openai_proxy_url.host}` : '❌ Не установлен'}</p>
                <p>Логов за 30 дней: {openaiStatus.logs.last30Days}</p>
                {openaiStatus.logs.recent.lastLog && (
                  <p>Последний лог: {new Date(openaiStatus.logs.recent.lastLog).toLocaleString('ru-RU')}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success status - only show if no logs AND no summary data */}
      {openaiStatus && openaiStatus.diagnostics.status === 'ok' && recentLogs.length === 0 && (!summary || summary.total_requests === 0) && (
        <Card className="mb-6 border-blue-300 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-800 flex items-center gap-2">
              ℹ️ Конфигурация в порядке, но логов нет
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700">
              OpenAI настроен правильно, но за выбранный период нет записей. 
              Возможно, никто не использовал AI-функции (обогащение, конструктор, дайджест).
            </p>
            <div className="mt-2 text-xs text-gray-600">
              <p>API Key: ✅ {openaiStatus.config.openai_api_key.prefix}</p>
              <p>Proxy: {openaiStatus.config.openai_proxy_url.set ? `✅ ${openaiStatus.config.openai_proxy_url.host}` : '⚠️ Не установлен (может блокироваться)'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="mb-6">
        <div className="flex gap-2">
          {[7, 30, 90].map(days => (
            <button
              key={days}
              onClick={() => setDaysFilter(days)}
              className={`px-4 py-2 rounded ${
                daysFilter === days
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {days} дней
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Всего запросов</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summary.total_requests || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Всего токенов</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {(summary.total_tokens || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Расходы (USD)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                ${(summary.total_cost_usd || 0).toFixed(4)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Расходы (RUB)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {(summary.total_cost_rub || 0).toFixed(2)} ₽
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* By Request Type */}
      {summary && summary.by_request_type && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Расходы по типам запросов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(summary.by_request_type).map(([type, stats]) => (
                <div key={type} className="flex items-center justify-between p-4 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{type}</p>
                    <p className="text-sm text-gray-600">
                      {stats.requests} запросов • {stats.tokens.toLocaleString()} токенов
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">${stats.cost_usd.toFixed(4)}</p>
                    <p className="text-sm text-gray-600">{stats.cost_rub.toFixed(2)} ₽</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Последние 50 запросов</CardTitle>
          <CardDescription>История вызовов OpenAI API</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Дата</th>
                  <th className="text-left p-2">Тип</th>
                  <th className="text-left p-2">Модель</th>
                  <th className="text-right p-2">Токены</th>
                  <th className="text-right p-2">USD</th>
                  <th className="text-right p-2">RUB</th>
                  <th className="text-left p-2">Организация</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map(log => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      {new Date(log.created_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="p-2">{log.request_type}</td>
                    <td className="p-2">{log.model}</td>
                    <td className="p-2 text-right">{log.total_tokens.toLocaleString()}</td>
                    <td className="p-2 text-right">${log.cost_usd.toFixed(4)}</td>
                    <td className="p-2 text-right">{log.cost_rub?.toFixed(2)} ₽</td>
                    <td className="p-2 text-xs text-gray-500">
                      {log.org_id ? log.org_id.slice(0, 8) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

