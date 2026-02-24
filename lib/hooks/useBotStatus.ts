import { useState, useEffect } from 'react'

interface BotStatus {
  telegramLinked: boolean
  assistBotStarted: boolean
  loading: boolean
}

const CACHE_KEY = 'orbo_bot_status'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useBotStatus(orgId: string): BotStatus {
  const [status, setStatus] = useState<BotStatus>({
    telegramLinked: true,
    assistBotStarted: true,
    loading: true,
  })

  useEffect(() => {
    const cacheKey = `${CACHE_KEY}_${orgId}`

    // Check sessionStorage cache
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Date.now() - parsed.ts < CACHE_TTL) {
          setStatus({ ...parsed.data, loading: false })
          return
        }
      }
    } catch { /* ignore */ }

    fetch(`/api/telegram/bot-status?orgId=${orgId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStatus({
            telegramLinked: data.telegramLinked,
            assistBotStarted: data.assistBotStarted,
            loading: false,
          })
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }))
          } catch { /* ignore */ }
        } else {
          setStatus(prev => ({ ...prev, loading: false }))
        }
      })
      .catch(() => {
        setStatus(prev => ({ ...prev, loading: false }))
      })
  }, [orgId])

  return status
}

/**
 * Invalidate cached bot status (call after user starts the bot)
 */
export function invalidateBotStatusCache(orgId: string) {
  try {
    sessionStorage.removeItem(`${CACHE_KEY}_${orgId}`)
  } catch { /* ignore */ }
}
