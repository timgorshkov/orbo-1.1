'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import { createClientLogger } from '@/lib/logger'
import { ymGoal } from '@/components/analytics/YandexMetrika'

// Компонент для обработки ошибок из URL (требует Suspense)
function ErrorHandler({ onError }: { onError: (msg: string) => void }) {
  const searchParams = useSearchParams()
  
  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      const errorMessages: Record<string, string> = {
        'Configuration': 'Ошибка конфигурации OAuth. Проверьте настройки провайдера.',
        'AccessDenied': 'Доступ запрещён. Попробуйте другой способ входа.',
        'Verification': 'Ссылка для входа истекла. Запросите новую.',
        'OAuthSignin': 'Ошибка при начале OAuth авторизации.',
        'OAuthCallback': 'Ошибка при обработке ответа от провайдера.',
        'OAuthCreateAccount': 'Не удалось создать аккаунт через OAuth.',
        'Callback': 'Ошибка обратного вызова.',
        'Default': 'Произошла неизвестная ошибка.',
        // Ошибки email magic link
        'missing_token': 'Отсутствует токен авторизации. Запросите ссылку повторно.',
        'invalid_token': 'Недействительная ссылка. Запросите новую ссылку для входа.',
        'expired_token': 'Срок действия ссылки истёк. Запросите новую ссылку для входа.',
        'user_create_failed': 'Не удалось создать аккаунт. Попробуйте позже.',
        'user_error': 'Ошибка пользователя. Попробуйте позже.',
        'session_error': 'Ошибка создания сессии. Попробуйте позже.',
        'verification_failed': 'Ошибка верификации. Попробуйте позже.',
      }
      onError(`Ошибка: ${errorMessages[error] || errorMessages['Default']}`)
    }
  }, [searchParams, onError])
  
  return null
}

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const logger = createClientLogger('SignIn');
  const router = useRouter();
  const { data: session, status } = useSession();
  const goalSent = useRef(false);

  // Track signin page view - once only
  useEffect(() => {
    if (goalSent.current) return;
    goalSent.current = true;
    ymGoal('signin_page_view', undefined, { once: true });
  }, []);

  // Редирект на /orgs если пользователь уже авторизован
  useEffect(() => {
    if (status === 'authenticated' && session) {
      logger.info({ email: session.user?.email }, 'User already authenticated, redirecting to /orgs');
      router.replace('/orgs');
    }
  }, [status, session, router, logger]);

  // Показываем загрузку пока проверяем сессию
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-600">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  // Если уже авторизован - не показываем форму (редирект в useEffect)
  if (status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-600">Перенаправление...</p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    
    try {
      // Используем собственный email auth через Unisender Go
      const response = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email,
          redirectUrl: '/orgs'
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        setMessage(`Ошибка: ${data.error || 'Не удалось отправить письмо'}`)
      } else {
        setMessage('Мы отправили ссылку для входа на ваш email. Проверьте почту!')
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        email
      }, 'Error sending sign-in email');
      setMessage('Произошла ошибка при отправке email')
    } finally {
      setLoading(false)
    }
  }

  /**
   * OAuth через NextAuth.js (независимо от Supabase)
   * Поддерживает Google и Yandex
   */
  async function signInWithOAuth(provider: 'google' | 'yandex') {
    setOauthLoading(provider)
    setMessage(null)
    
    try {
      // NextAuth.js signIn - редиректит на провайдера
      await signIn(provider, {
        callbackUrl: '/orgs', // После успешного входа
      })
      // Редирект произойдёт автоматически
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        provider
      }, 'OAuth exception');
      setMessage('Произошла ошибка при входе')
      setOauthLoading(null)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Обработка ошибок из URL (NextAuth редиректит с ?error=...) */}
      <Suspense fallback={null}>
        <ErrorHandler onError={setMessage} />
      </Suspense>
      
      {/* Left side - Branding */}
      <div className="hidden lg:flex flex-col justify-center items-center bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 text-white p-12">
        <div className="max-w-md space-y-6">
          <Image 
            src="/orbo-logo-2-no-bg.png" 
            alt="Orbo" 
            width={200} 
            height={60}
            className="mb-8"
            priority
          />
          <h2 className="text-3xl font-bold">
            CRM для групп и сообществ в мессенджерах
          </h2>
          <ul className="space-y-4 text-lg">
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>AI-профили участников с интересами и запросами</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>События с регистрацией и сбором оплат</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Уведомления о негативе и неответах</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Аналитика активности и удержания</span>
            </li>
          </ul>
          <p className="text-blue-100 text-sm mt-8">
            Telegram, WhatsApp, Max — всё в одном месте
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex flex-col justify-center items-center p-6 bg-slate-50">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <Image 
              src="/orbo-logo-2-no-bg.png" 
              alt="Orbo" 
              width={160} 
              height={48}
              className="mx-auto"
            />
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Вход в Orbo</h1>
            
            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-gray-300 hover:bg-gray-50 font-medium"
                onClick={() => signInWithOAuth('google')}
                disabled={oauthLoading === 'google'}
              >
                {oauthLoading === 'google' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Вход...
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Войти через Google
                  </span>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-gray-300 hover:bg-gray-50 font-medium"
                onClick={() => signInWithOAuth('yandex')}
                disabled={oauthLoading === 'yandex'}
              >
                {oauthLoading === 'yandex' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Вход...
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#FC3F1D" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/>
                      <path fill="#FFFFFF" d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.715-3.108 4.87H7.365l2.794-4.343c-1.56-1.1-2.486-2.244-2.486-4.048 0-2.387 1.661-3.942 4.803-3.942h2.937v12.333h-2.09V7.666z"/>
                    </svg>
                    Войти через Яндекс
                  </span>
                )}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">или по email</span>
              </div>
            </div>
            
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input 
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" 
                disabled={loading}
              >
                {loading ? 'Отправка...' : 'Получить ссылку для входа'}
              </Button>
              
              {message && (
                <div className={`p-3 rounded-lg text-sm ${
                  message.includes('Ошибка')
                    ? 'bg-red-50 text-red-600 border border-red-200' 
                    : message.includes('отправили')
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {message}
                </div>
              )}
            </form>
          </div>

          <p className="text-sm text-center text-gray-600">
            Еще нет аккаунта?{' '}
            <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700 underline">
              Зарегистрироваться бесплатно
            </Link>
          </p>

          <p className="text-xs text-center text-gray-500">
            <Link href="https://orbo.ru" className="hover:text-gray-700">
              ← На главную
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
