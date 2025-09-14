'use client'
import { useState } from 'react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/client/supabaseClient'

export default function AuthCallback() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = createClientBrowser()
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          console.error('Session error:', sessionError)
          setError(sessionError.message)
          return
        }
        if (data && data.session) {
          console.log('Authenticated, redirecting to app...')

          if (data && data.session) {
            // Сохраняем информацию о сессии для отладки
            localStorage.setItem('debug_session', JSON.stringify({
              userId: data.session.user.id,
              email: data.session.user.email,
              timestamp: new Date().toISOString()
            }));

          setTimeout(() => router.push('/app'), 500)
          } else {
           setError('Не удалось получить сессию пользователя')
          }
        }
      } catch (e: any) {
        console.error('Auth callback error:', e)
        setError('Произошла ошибка при обработке аутентификации')
      }
    }
    handleCallback()
  }, [router])
  return (
    <div className="min-h-screen grid place-items-center">
    {error ? (
      <div className="text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <a href="/signin" className="text-blue-500 underline">
          Вернуться на страницу входа
        </a>
      </div>
    ) : (
      <p>Загрузка...</p>
    )}
    </div>
  )
}
