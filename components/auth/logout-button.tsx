'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'
import { signOut } from 'next-auth/react'

interface LogoutButtonProps {
  className?: string
  showIcon?: boolean
  variant?: 'default' | 'text'
}

export function LogoutButton({ 
  className = '', 
  showIcon = true,
  variant = 'default'
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setLoading(true)
    
    try {
      // Clear Supabase session
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: '/signin' })
      })
      
      // Clear NextAuth session (for OAuth users)
      await signOut({ redirect: false })
      
      // Redirect to signin
      router.push('/signin')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      // Still try to redirect even if logout fails
      router.push('/signin')
    }
  }

  const baseStyles = variant === 'text'
    ? 'text-gray-500 hover:text-gray-700 text-sm'
    : 'inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors'

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={`${baseStyles} ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Выход...</span>
        </>
      ) : (
        <>
          {showIcon && <LogOut className="h-4 w-4" />}
          <span>Выйти из аккаунта</span>
        </>
      )}
    </button>
  )
}

