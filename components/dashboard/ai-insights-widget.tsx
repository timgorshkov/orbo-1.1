'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AiCredits {
  total: number
  used: number
  remaining: number
}

interface AiInsights {
  health_score: number
  health_label: string
  key_findings: string[]
  risks: string[]
  recommendations: string[]
  highlight: string
}

export default function AiInsightsWidget({ orgId }: { orgId: string }) {
  const [credits, setCredits] = useState<AiCredits | null>(null)
  const [insights, setInsights] = useState<AiInsights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/ai/community-insights?orgId=${orgId}`)
      .then(r => r.json())
      .then(data => {
        if (data.credits) setCredits(data.credits)
      })
      .catch(() => {})
      .finally(() => setCreditsLoading(false))
  }, [orgId])

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/community-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'no_credits') {
          setError('AI-кредиты закончились. Напишите нам для подключения.')
        } else {
          setError(data.details || data.error || 'Ошибка анализа')
        }
        return
      }

      setInsights(data.insights)
      setCredits(data.credits)
    } catch {
      setError('Не удалось выполнить анализ. Попробуйте позже.')
    } finally {
      setLoading(false)
    }
  }

  const remaining = credits?.remaining ?? 0

  const healthColor = (score: number) => {
    if (score >= 7) return 'text-green-600'
    if (score >= 4) return 'text-yellow-600'
    return 'text-red-600'
  }

  const healthBg = (score: number) => {
    if (score >= 7) return 'bg-green-50 border-green-200'
    if (score >= 4) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  if (creditsLoading) {
    return (
      <Card className="border bg-gradient-to-br from-indigo-50/50 to-purple-50/50">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-40 bg-gray-200 rounded" />
            <div className="h-4 w-64 bg-gray-200 rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Already analyzed — show results
  if (insights) {
    return (
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">✨</span>
              AI-анализ сообщества
            </CardTitle>
            <div className={`text-2xl font-bold ${healthColor(insights.health_score)}`}>
              {insights.health_score}/10
            </div>
          </div>
          <p className="text-sm text-gray-500">{insights.health_label}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Highlight */}
          <div className={`p-3 rounded-lg border ${healthBg(insights.health_score)}`}>
            <p className="text-sm font-medium">{insights.highlight}</p>
          </div>

          {/* Key findings */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Находки</p>
            <ul className="space-y-1.5">
              {insights.key_findings.map((f, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendations */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Рекомендации</p>
            <ul className="space-y-1.5">
              {insights.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">→</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          {insights.risks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Риски</p>
              <ul className="space-y-1.5">
                {insights.risks.map((r, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Run again if credits remain */}
          {remaining > 0 && (
            <div className="pt-2 border-t">
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
              >
                {loading ? 'Анализирую...' : `Обновить анализ (осталось ${remaining})`}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // No analysis yet — show CTA
  return (
    <Card className="border bg-gradient-to-br from-indigo-50/50 to-purple-50/50 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-2xl">✨</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 mb-1">AI-анализ сообщества</h3>
            <p className="text-sm text-gray-600 mb-4">
              AI проанализирует активность, участников и события — и даст конкретные рекомендации по развитию.
            </p>

            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={runAnalysis}
                disabled={loading || remaining <= 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Анализирую...
                  </>
                ) : (
                  'Запустить анализ'
                )}
              </button>
              <span className="text-xs text-gray-500">
                {remaining > 0
                  ? `${remaining} бесплатн${remaining === 1 ? 'ый' : remaining < 5 ? 'ых' : 'ых'} анализ${remaining === 1 ? '' : remaining < 5 ? 'а' : 'ов'}`
                  : 'Кредиты закончились'
                }
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
