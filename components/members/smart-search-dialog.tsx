'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Search, Loader2, ExternalLink, User, Zap, Database } from 'lucide-react'
import { Button } from '../ui/button'

type SearchResult = {
  id: string
  full_name: string | null
  username: string | null
  bio: string | null
  photo_url: string | null
  goals_self: string | null
  offers: string | null
  interests_keywords: string | null
  behavioral_role: string | null
  rank?: number
}

type SearchMode = 'ai' | 'fts'

type Props = {
  orgId: string
}

function normalizePhotoUrl(url: string | null | undefined): string | null {
  if (!url || url === 'none' || url === 'null') return null
  return url
}

function Avatar({ result }: { result: SearchResult }) {
  const photo = normalizePhotoUrl(result.photo_url)
  const name = result.full_name || result.username || '?'
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  return (
    <div className="w-11 h-11 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-neutral-600">
      {initials || <User className="w-5 h-5 text-neutral-400" />}
    </div>
  )
}

function ModeBadge({ mode, fallback }: { mode: SearchMode; fallback?: boolean }) {
  if (mode === 'ai' && !fallback) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">
        <Zap className="w-3 h-3" />
        AI-поиск
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-xs font-medium">
      <Database className="w-3 h-3" />
      Текстовый поиск
    </span>
  )
}

export function SmartSearchDialog({ orgId }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<SearchResult[]>([])
  const [explanations, setExplanations] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<SearchMode>('fts')
  const [fallback, setFallback] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults([])
      setExplanations({})
      setStatus('idle')
      setErrorMsg('')
      setFallback(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  async function handleSearch() {
    const q = query.trim()
    if (!q || q.length < 2) return

    setStatus('loading')
    setResults([])
    setExplanations({})
    setErrorMsg('')

    try {
      const res = await fetch('/api/participants/smart-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, query: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка поиска')

      setResults(data.results ?? [])
      setExplanations(data.explanations ?? {})
      setMode(data.mode ?? 'fts')
      setFallback(!!data.fallback)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка поиска')
      setStatus('error')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSearch()
    }
  }

  function openParticipant(id: string) {
    window.open(`/app/${orgId}/members/${id}`, '_blank')
  }

  const hasResults = status === 'done' && results.length > 0
  const isEmpty = status === 'done' && results.length === 0

  return (
    <>
      {/* Trigger */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 shrink-0"
        title="Умный поиск по профилям участников"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Найти</span>
      </Button>

      {/* Dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="absolute inset-0 bg-black/40" />

          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-neutral-100">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-neutral-900">Умный поиск участников</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Опишите, кого ищете — по целям, интересам, навыкам или чем могут помочь
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input */}
            <div className="px-5 pt-4 pb-3">
              <textarea
                ref={textareaRef}
                rows={3}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  'Кого вы ищете? Например: «разработчик iOS», «кто помогает с маркетингом», ' +
                  '«интересуется EdTech», «застройщик или девелопер»…'
                }
                className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-neutral-400">⌘ Enter — начать поиск</p>
                <Button
                  size="sm"
                  onClick={handleSearch}
                  disabled={status === 'loading' || query.trim().length < 2}
                  className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {/* Show searching hint since AI can take a moment */}
                      Ищем…
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Найти участников
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Results */}
            {(hasResults || isEmpty || status === 'error') && (
              <div className="border-t border-neutral-100 max-h-[50vh] overflow-y-auto">
                {status === 'error' && (
                  <div className="px-5 py-6 text-center text-sm text-red-500">{errorMsg}</div>
                )}

                {isEmpty && (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm font-medium text-neutral-700">Никого не нашлось</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Попробуйте другие слова или более короткий запрос
                    </p>
                  </div>
                )}

                {hasResults && (
                  <>
                    <ul className="divide-y divide-neutral-50">
                      {results.map((p) => {
                        const displayName =
                          p.full_name || (p.username ? `@${p.username}` : 'Участник')
                        const aiReason = explanations[p.id]
                        // Fallback snippet for FTS mode
                        const ftsSnippet = !aiReason
                          ? (p.goals_self || p.offers || p.bio || p.interests_keywords || null)
                          : null
                        const snippet = aiReason || ftsSnippet

                        return (
                          <li
                            key={p.id}
                            className="flex items-start gap-3 px-5 py-3.5 hover:bg-neutral-50 transition-colors"
                          >
                            <Avatar result={p} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-900 truncate">
                                {displayName}
                              </p>
                              {p.username && p.full_name && (
                                <p className="text-xs text-neutral-400">@{p.username}</p>
                              )}
                              {snippet && (
                                <p
                                  className={`text-xs mt-0.5 leading-snug ${
                                    aiReason
                                      ? 'text-violet-700 bg-violet-50 rounded px-1.5 py-0.5 inline-block mt-1'
                                      : 'text-neutral-500'
                                  }`}
                                >
                                  {snippet.length > 110 ? snippet.slice(0, 110) + '…' : snippet}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => openParticipant(p.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors flex-shrink-0 mt-0.5"
                            >
                              Открыть
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>

                    {/* Footer */}
                    <div className="px-5 py-2.5 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between gap-2">
                      <p className="text-xs text-neutral-400">
                        {results.length}{' '}
                        {results.length === 1
                          ? 'участник'
                          : results.length < 5
                          ? 'участника'
                          : 'участников'}
                        {fallback && ' · FTS (AI временно недоступен)'}
                      </p>
                      <ModeBadge mode={mode} fallback={fallback} />
                    </div>

                    {/* Upgrade hint for FTS mode */}
                    {mode === 'fts' && !fallback && (
                      <div className="px-5 py-2.5 border-t border-neutral-100 bg-gradient-to-r from-violet-50 to-white">
                        <p className="text-xs text-violet-600">
                          <Zap className="w-3 h-3 inline mr-1" />
                          Тариф Pro даёт AI-поиск — находит участников по смыслу, даже без совпадения слов
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
