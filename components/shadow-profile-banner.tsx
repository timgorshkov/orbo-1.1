'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, X } from 'lucide-react'

interface ShadowProfileBannerProps {
  userId?: string
}

export function ShadowProfileBanner({ userId }: ShadowProfileBannerProps) {
  const router = useRouter()
  const [showBanner, setShowBanner] = useState(false)
  const [isShadow, setIsShadow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    checkShadowStatus()
  }, [userId])

  const checkShadowStatus = async () => {
    try {
      const response = await fetch('/api/auth/activate-profile')
      if (response.ok) {
        const data = await response.json()
        setIsShadow(data.needs_activation || false)
        setShowBanner(data.needs_activation && !dismissed)
      }
    } catch (error) {
      console.error('Error checking shadow status:', error)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    setShowBanner(false)
    // Сохраняем в localStorage, чтобы не показывать постоянно
    if (typeof window !== 'undefined') {
      localStorage.setItem('shadow_banner_dismissed', 'true')
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const wasDismissed = localStorage.getItem('shadow_banner_dismissed')
      if (wasDismissed === 'true') {
        setDismissed(true)
        setShowBanner(false)
      }
    }
  }, [])

  if (!showBanner || !isShadow) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <AlertCircle className="text-amber-600 flex-shrink-0" size={20} />
            <p className="text-sm text-amber-800">
              Вы работаете в режиме чтения. 
              <strong className="ml-1">Добавьте email</strong> для создания и редактирования материалов.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/settings/profile')}
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Добавить email
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-amber-100 rounded transition-colors"
              title="Закрыть"
            >
              <X size={18} className="text-amber-700" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

