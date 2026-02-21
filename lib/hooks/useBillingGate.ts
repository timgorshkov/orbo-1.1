'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface BillingStatus {
  plan: { code: string; name: string; price_monthly: number | null; limits: { participants: number; ai_requests_per_month: number; custom_notification_rules: boolean }; features: Record<string, boolean> }
  participantCount: number
  participantLimit: number
  isOverLimit: boolean
  gracePeriodExpired: boolean
  daysOverLimit: number
  paymentUrl: string
  aiEnabled: boolean
  isTrial: boolean
  trialDaysRemaining: number
  trialExpired: boolean
  trialWarning: boolean
}

interface UseBillingGateReturn {
  status: BillingStatus | null
  loading: boolean
  isFeatureAllowed: (feature: 'ai_analysis' | 'custom_rules') => boolean
  showUpgradeForFeature: (feature: 'ai_analysis' | 'custom_rules') => boolean
  refresh: () => Promise<void>
}

const cache = new Map<string, { data: BillingStatus; time: number }>()
const CACHE_TTL = 60_000 // 1 minute

export function useBillingGate(orgIdOverride?: string): UseBillingGateReturn {
  const params = useParams()
  const orgId = orgIdOverride || (params?.org as string)
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    if (!orgId) return

    const cached = cache.get(orgId)
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setStatus(cached.data)
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/billing/status?orgId=${orgId}`)
      if (!res.ok) throw new Error('Failed to fetch billing status')
      const data = await res.json()
      cache.set(orgId, { data, time: Date.now() })
      setStatus(data)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const isFeatureAllowed = useCallback((feature: 'ai_analysis' | 'custom_rules') => {
    if (!status) return false
    // During active trial, all Pro features are available
    if (status.isTrial && !status.trialExpired) return true
    return status.aiEnabled
  }, [status])

  const showUpgradeForFeature = useCallback((feature: 'ai_analysis' | 'custom_rules') => {
    if (!status) return false
    // During active trial, no upgrade needed
    if (status.isTrial && !status.trialExpired) return false
    return !status.aiEnabled
  }, [status])

  const refresh = useCallback(async () => {
    if (orgId) cache.delete(orgId)
    setLoading(true)
    await fetchStatus()
  }, [orgId, fetchStatus])

  return { status, loading, isFeatureAllowed, showUpgradeForFeature, refresh }
}
