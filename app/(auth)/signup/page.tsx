'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import { createClientLogger } from '@/lib/logger'
import { ymGoal } from '@/components/analytics/YandexMetrika'

const REGISTRATION_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const logger = createClientLogger('SignUp');
  const router = useRouter();
  const { data: session, status } = useSession();
  const goalSent = useRef(false);
  
  // Track signup page view - once only
  useEffect(() => {
    if (goalSent.current) return;
    goalSent.current = true;
    ymGoal('signup_page_view', undefined, { once: true });
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
          redirectUrl: '/welcome' // Для новых пользователей - на welcome
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        setMessage(`Ошибка: ${data.error || 'Не удалось отправить письмо'}`)
      } else {
        setMessage('Отлично! Мы отправили ссылку для подтверждения на ваш email.')
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        email
      }, 'Error sending sign-up email');
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
      // Для регистрации используем /welcome как callbackUrl
      await signIn(provider, {
        callbackUrl: '/welcome', // После успешной регистрации на welcome
      })
      // Редирект произойдёт автоматически
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        provider
      }, 'OAuth exception');
      setMessage('Произошла ошибка при регистрации')
      setOauthLoading(null)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left side - Branding */}
      <div className="hidden lg:flex flex-col justify-center items-center bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 text-white p-12">
        <div className="max-w-md space-y-6">
          <Image 
            src="/orbo-logo-2-no-bg.png" 
            alt="Orbo" 
            width={200} 
            height={60}
            className="mb-8"
          />
          <h2 className="text-3xl font-bold">
            Люди доходят до мероприятий и остаются в контакте
          </h2>
          <ul className="space-y-4 text-lg">
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Регистрация и напоминания повышают доходимость</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Карточки участников с историей посещений</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Оплаты, статусы и анонсы — без ручной работы</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Заявки на вступление с анкетой и воронкой</span>
            </li>
          </ul>
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4 mt-8">
            <p className="text-lg font-semibold">Бесплатно для сообществ до 500 участников</p>
            <p className="text-blue-100 text-sm mt-1">
              Telegram, WhatsApp — всё в одном месте
            </p>
          </div>
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
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Начните бесплатно</h1>
              <p className="text-sm text-gray-600">
                Создайте пространство и проведите первое событие за 5 минут
              </p>
            </div>
            
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
                    Регистрация...
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Продолжить с Google
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
                    Регистрация...
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#FC3F1D" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/>
                      <path fill="#FFFFFF" d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.715-3.108 4.87H7.365l2.794-4.343c-1.56-1.1-2.486-2.244-2.486-4.048 0-2.387 1.661-3.942 4.803-3.942h2.937v12.333h-2.09V7.666z"/>
                    </svg>
                    Продолжить с Яндекс
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
                <p className="text-xs text-gray-500">
                  Мы отправим вам ссылку для входа без пароля
                </p>
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" 
                disabled={loading}
              >
                {loading ? 'Отправка...' : 'Зарегистрироваться бесплатно'}
              </Button>
              
              {message && (
                <div className={`p-3 rounded-lg text-sm ${
                  message.includes('Ошибка')
                    ? 'bg-red-50 text-red-600 border border-red-200' 
                    : message.includes('Отлично')
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {message}
                </div>
              )}

              <p className="text-xs text-gray-500 text-center pt-2">
                Регистрируясь, вы соглашаетесь с{' '}
                <Link href="https://orbo.ru/terms" className="text-gray-500 hover:text-gray-700">
                  условиями использования
                </Link>
              </p>
            </form>
          </div>

          {/* Telegram Registration */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
            <p className="text-sm text-gray-600 mb-4 text-center">
              Или зарегистрируйтесь через Telegram
            </p>
            <a
              href={`https://t.me/${REGISTRATION_BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => ymGoal('telegram_registration_click', undefined, { once: true })}
              className="flex items-center justify-center gap-3 w-full h-11 rounded-lg bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              Продолжить в Telegram
            </a>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Откроется бот для быстрой регистрации
            </p>
          </div>

          <p className="text-sm text-center text-gray-600">
            Уже есть аккаунт?{' '}
            <Link href="/signin" className="font-medium text-blue-600 hover:text-blue-700 underline">
              Войти
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
