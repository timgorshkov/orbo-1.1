'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Legacy auth callback page for Supabase Auth
 * Now redirects to signin since we use NextAuth
 */
export default function AuthCallback() {
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to signin - NextAuth handles auth callbacks at /api/auth/callback/[provider]
    router.replace('/signin')
  }, [router])
  
  return (
    <div className="min-h-screen grid place-items-center">
      <p>Перенаправление...</p>
    </div>
  )
}
