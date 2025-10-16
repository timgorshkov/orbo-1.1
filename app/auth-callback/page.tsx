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
        
        // Явно обрабатываем код из URL
        const hash = window.location.hash
        console.log('Auth callback hash:', hash ? 'Hash present' : 'No hash')
        
        if (hash && hash.includes('access_token')) {
          // Обмениваем код на сессию
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(hash.substring(1))
          
          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError(exchangeError.message)
            return
          }
          
          console.log('Code exchange successful:', exchangeData ? 'Session created' : 'No session')
        }
        
        // Проверяем сессию после обмена кода
        const { data, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          setError(sessionError.message)
          return
        }
        
        if (data && data.session) {
          console.log('Authenticated, checking organizations...')
          
          // Получаем организации пользователя
          const { data: orgs, error: orgsError } = await supabase
            .from('memberships')
            .select('org_id, organizations(id)')
            .eq('user_id', data.session.user.id)
          
          if (orgsError) {
            console.error('Error fetching organizations:', orgsError)
            // Fallback - редиректим на /orgs
            setTimeout(() => router.push('/orgs'), 500)
            return
          }
          
          console.log(`Found ${orgs?.length || 0} organizations`)
          
          // Сохраняем информацию о сессии для отладки
          localStorage.setItem('debug_session', JSON.stringify({
            userId: data.session.user.id,
            email: data.session.user.email,
            orgsCount: orgs?.length || 0,
            timestamp: new Date().toISOString()
          }));
          
          // Умный редирект
          if (!orgs || orgs.length === 0) {
            // Нет организаций → создание новой
            console.log('No organizations, redirecting to create...')
            setTimeout(() => router.push('/orgs/new'), 500)
          } else {
            // Есть организации → dashboard первой
            const firstOrg = orgs[0].organizations as any
            console.log('Has organizations, redirecting to dashboard of:', firstOrg?.id)
            setTimeout(() => router.push(`/app/${firstOrg?.id}/dashboard`), 500)
          }
        } else {
          setError('Не удалось получить сессию пользователя')
        }
      } catch (e: any) {
        console.error('Auth callback error:', e)
        setError('Произошла ошибка при обработке аутентификации: ' + (e.message || 'Неизвестная ошибка'))
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
