'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface ParticipantProfile {
  id: string
  name: string
  username: string | null
  messageCount: number
  lastActive: string | null
  interests: string[]
  topics: Record<string, number>
  recentAsks: string[]
  city: string | null
  role: string | null
  success: boolean
}

interface AiCredits {
  total: number
  used: number
  remaining: number
}

export default function AiInsightsWidget({ orgId }: { orgId: string }) {
  const [credits, setCredits] = useState<AiCredits | null>(null)
  const [hasData, setHasData] = useState(false)
  const [profiles, setProfiles] = useState<ParticipantProfile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/ai/community-insights?orgId=${orgId}`)
      .then(r => r.json())
      .then(data => {
        if (data.credits) setCredits(data.credits)
        setHasData(!!data.hasData)
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false))
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
        } else if (data.error === 'no_data') {
          setError(data.message || 'Недостаточно данных.')
        } else {
          setError(data.details || data.error || 'Ошибка анализа')
        }
        return
      }

      setProfiles(data.profiles)
      setCredits(data.credits)
    } catch {
      setError('Не удалось выполнить анализ. Попробуйте позже.')
    } finally {
      setLoading(false)
    }
  }

  // Don't render anything while loading initial state
  if (initialLoading) return null

  // Don't show if no groups/messages
  if (!hasData) return null

  const remaining = credits?.remaining ?? 0
  const isUnlimited = remaining === -1

  // PRO/Enterprise: AI available in every profile, no need for dashboard demo widget
  if (isUnlimited) return null

  // No credits left and no results to show
  if (remaining <= 0 && !profiles) return null

  const roleLabels: Record<string, string> = {
    'leader': 'Лидер',
    'expert': 'Эксперт',
    'connector': 'Коннектор',
    'active': 'Активный',
    'observer': 'Наблюдатель',
    'newcomer': 'Новичок',
  }

  // Show results
  if (profiles && profiles.length > 0) {
    return (
      <Card className="border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span>✨</span> AI-анализ участников
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">доступен в профиле каждого участника</span>
              {remaining > 0 && (
                <button
                  onClick={runAnalysis}
                  disabled={loading}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                >
                  {loading ? 'Анализирую...' : `Обновить (${remaining})`}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.filter(p => p.success).map(p => (
              <a
                key={p.id}
                href={`/p/${orgId}/members/${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-gray-50 rounded-lg p-4 space-y-3 hover:bg-gray-100 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {p.username ? `@${p.username}` : ''}
                      {p.messageCount > 0 && ` · ${p.messageCount} сообщ.`}
                      {p.city && ` · ${p.city}`}
                    </p>
                  </div>
                  {p.role && (
                    <span className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                      {roleLabels[p.role] || p.role}
                    </span>
                  )}
                </div>

                {/* Interests */}
                {p.interests.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Интересы и экспертиза</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.interests.slice(0, 8).map((tag, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent asks */}
                {p.recentAsks.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Запросы</p>
                    <ul className="space-y-1">
                      {p.recentAsks.slice(0, 3).map((ask, i) => (
                        <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                          <span className="text-amber-500 mt-px flex-shrink-0">?</span>
                          {ask}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Topics (top 4) */}
                {Object.keys(p.topics).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Темы</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(p.topics)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([topic, count], i) => (
                          <span key={i} className="text-xs text-gray-600">
                            {topic}{count > 1 ? ` (${count})` : ''}
                          </span>
                        ))
                      }
                    </div>
                  </div>
                )}
              </a>
            ))}
          </div>

        </CardContent>
      </Card>
    )
  }

  // CTA state
  return (
    <Card className="border bg-gradient-to-br from-indigo-50/50 to-purple-50/50">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-xl">✨</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 mb-1">AI-анализ участников</h3>
            <p className="text-sm text-gray-600 mb-3">
              AI определит интересы, экспертизу и запросы двух самых активных участников по их сообщениям.
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
                  ? `${remaining} бесплатн${remaining === 1 ? 'ый' : 'ых'} анализ${remaining === 1 ? '' : remaining < 5 ? 'а' : 'ов'}`
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
