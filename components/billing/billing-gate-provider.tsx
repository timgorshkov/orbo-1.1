'use client'

import { useEffect, useState } from 'react'
import UpgradeDialog from './upgrade-dialog'

interface BillingGateProviderProps {
  orgId: string
  role: string
  children: React.ReactNode
}

export default function BillingGateProvider({ orgId, role, children }: BillingGateProviderProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [billingData, setBillingData] = useState<{
    participantCount: number
    participantLimit: number
    paymentUrl: string
    planName: string
    isTrial: boolean
    trialDaysRemaining: number
    trialExpired: boolean
    trialWarning: boolean
  } | null>(null)

  useEffect(() => {
    if (!orgId || !['owner', 'admin'].includes(role)) return

    fetch(`/api/billing/status?orgId=${orgId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return

        const { isTrial, trialExpired, trialWarning } = data

        // Active trial with >3 days left → no dialog at all
        if (isTrial && !trialWarning) return

        // Trial warning (last 3 days) or trial expired → show dialog
        if (isTrial && trialWarning) {
          setBillingData({
            participantCount: data.participantCount,
            participantLimit: data.participantLimit === -1 ? Infinity : data.participantLimit,
            paymentUrl: data.paymentUrl,
            planName: data.plan?.name || 'Профессиональный',
            isTrial: true,
            trialDaysRemaining: data.trialDaysRemaining,
            trialExpired: trialExpired,
            trialWarning: true,
          })
          setBlocking(trialExpired)
          setShowDialog(true)
          return
        }

        // Non-trial: only show if over limit (shouldn't normally happen with auto-trial)
        if (data.isOverLimit) {
          setBillingData({
            participantCount: data.participantCount,
            participantLimit: data.participantLimit === -1 ? Infinity : data.participantLimit,
            paymentUrl: data.paymentUrl,
            planName: data.plan?.name || 'Бесплатный',
            isTrial: false,
            trialDaysRemaining: 0,
            trialExpired: false,
            trialWarning: false,
          })
          setBlocking(data.gracePeriodExpired)
          setShowDialog(true)
        }
      })
      .catch(() => {})
  }, [orgId, role])

  return (
    <>
      {children}
      {billingData && (
        <UpgradeDialog
          isOpen={showDialog}
          onClose={blocking ? undefined : () => setShowDialog(false)}
          blocking={blocking}
          reason="participant_limit"
          participantCount={billingData.participantCount}
          participantLimit={billingData.participantLimit}
          paymentUrl={billingData.paymentUrl}
          planName={billingData.planName}
          isTrial={billingData.isTrial}
          trialDaysRemaining={billingData.trialDaysRemaining}
          trialExpired={billingData.trialExpired}
        />
      )}
    </>
  )
}
