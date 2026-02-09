'use client'

import { useState, useEffect } from 'react'
import WelcomeBlock from './welcome-block'
import OnboardingChecklist from './onboarding-checklist'

interface OnboardingWrapperProps {
  isOnboarding: boolean
  orgId: string
  orgName: string
  onboardingStatus: any
}

export default function OnboardingWrapper({ 
  isOnboarding, 
  orgId, 
  orgName, 
  onboardingStatus 
}: OnboardingWrapperProps) {
  const [hidden, setHidden] = useState(false)

  // Check localStorage for skip preference
  useEffect(() => {
    const skipKey = `orbo_skip_onboarding_${orgId}`
    if (localStorage.getItem(skipKey) === 'true') {
      setHidden(true)
    }
  }, [orgId])

  if (!isOnboarding || hidden) return null

  const handleSkip = () => {
    const skipKey = `orbo_skip_onboarding_${orgId}`
    localStorage.setItem(skipKey, 'true')
    setHidden(true)
  }

  return (
    <div className="space-y-6">
      <WelcomeBlock orgName={orgName} />
      <OnboardingChecklist orgId={orgId} status={onboardingStatus} />
      <div className="text-center">
        <button
          onClick={handleSkip}
          className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          Скрыть и перейти к дашборду
        </button>
      </div>
    </div>
  )
}
