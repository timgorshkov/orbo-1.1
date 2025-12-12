'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface TelegramAuthClientProps {
  code: string
  redirectUrl: string
}

/**
 * Client component that handles Telegram auth redirect
 * 
 * When user lands on this page:
 * 1. If code is present, redirect to auth handler to process authentication
 * 2. If no code, redirect to signin page
 * 
 * For crawlers (like Telegram preview bot):
 * - They will see the OG metadata from the server component
 * - They won't execute JavaScript, so no redirect happens for them
 */
export default function TelegramAuthClient({ code, redirectUrl }: TelegramAuthClientProps) {
  const router = useRouter()
  
  useEffect(() => {
    if (code) {
      // Build URL to auth handler with same parameters
      const handlerUrl = `/auth/telegram-handler?code=${encodeURIComponent(code)}&redirect=${encodeURIComponent(redirectUrl)}`
      
      // Use window.location for immediate redirect (faster than router.push)
      window.location.href = handlerUrl
    } else {
      // No code provided, redirect to signin
      router.push('/signin?error=missing_code')
    }
  }, [code, redirectUrl, router])
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
      <div className="text-center text-white p-8">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Авторизация...</h1>
        <p className="text-white/80 text-sm">Подождите, выполняется вход</p>
      </div>
    </div>
  )
}

