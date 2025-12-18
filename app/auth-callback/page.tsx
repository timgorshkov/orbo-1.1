'use client'
import { useState } from 'react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/client/supabaseClient'
import { createClientLogger } from '@/lib/logger'

export default function AuthCallback() {
  const logger = createClientLogger('AuthCallback');
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = createClientBrowser()
        
        // Логируем параметры для отладки
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')
        const hash = window.location.hash
        
        logger.debug({ 
          has_code: !!code, 
          has_hash: !!hash,
          url: window.location.href
        }, 'Auth callback started');
        
        // Supabase автоматически обрабатывает code из URL через PKCE
        // Не нужно вручную вызывать exchangeCodeForSession - это сломает PKCE flow
        // Просто вызываем getSession, и Supabase сам обработает код
        const { data, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          logger.error({ 
            error: sessionError.message
          }, 'Session error');
          setError(sessionError.message)
          return
        }
        
        if (data && data.session) {
          logger.debug({ user_id: data.session.user.id }, 'Authenticated, checking organizations');
          
          // Получаем организации пользователя
          const { data: orgs, error: orgsError } = await supabase
            .from('memberships')
            .select('org_id, organizations(id)')
            .eq('user_id', data.session.user.id)
          
          if (orgsError) {
            logger.error({ 
              error: orgsError.message,
              user_id: data.session.user.id
            }, 'Error fetching organizations');
            // Fallback - редиректим на /orgs
            setTimeout(() => router.push('/orgs'), 500)
            return
          }
          
          logger.debug({ 
            org_count: orgs?.length || 0,
            user_id: data.session.user.id
          }, 'Found organizations');
          
          // Сохраняем информацию о сессии для отладки
          localStorage.setItem('debug_session', JSON.stringify({
            userId: data.session.user.id,
            email: data.session.user.email,
            orgsCount: orgs?.length || 0,
            timestamp: new Date().toISOString()
          }));
          
          // Умный редирект
          // ✅ Если организаций нет - редирект на welcome страницу (не на форму создания)
          if (!orgs || orgs.length === 0) {
            logger.debug({}, 'No organizations, redirecting to welcome');
            setTimeout(() => router.push('/welcome'), 500)
          } else {
            // Есть организации → список для выбора
            logger.debug({ org_count: orgs.length }, 'Has organizations, redirecting to list');
            setTimeout(() => router.push('/orgs'), 500)
          }
        } else {
          logger.error({}, 'Failed to get user session');
          setError('Не удалось получить сессию пользователя')
        }
      } catch (e: any) {
        logger.error({ 
          error: e.message,
          stack: e.stack
        }, 'Auth callback error');
        setError('Произошла ошибка при обработке аутентификации: ' + (e.message || 'Неизвестная ошибка'))
      }
    }
    handleCallback()
  }, [router, logger])
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
