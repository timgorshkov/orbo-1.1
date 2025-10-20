'use client'
import { useState } from 'react'
import { createClientBrowser } from '@/lib/client/supabaseClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import Link from 'next/link'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    
    try {
      const supabase = createClientBrowser()
      const { error } = await supabase.auth.signInWithOtp({ 
        email, 
        options: { 
          emailRedirectTo: `${window.location.origin}/auth/callback` 
        } 
      })
      
      if (error) {
        setMessage(`Ошибка: ${error.message}`)
      } else {
        setMessage('✉️ Мы отправили ссылку для входа на ваш email. Проверьте почту!')
      }
    } catch (error) {
      setMessage('Произошла ошибка при отправке email')
      console.error(error)
    } finally {
      setLoading(false)
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
            Управление Telegram-сообществом в одном месте
          </h2>
          <ul className="space-y-4 text-lg">
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>CRM участников с профилями и поиском</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>База знаний как в Notion</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>События с QR-чекином</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-6 h-6 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Дашборд активности и удержания</span>
            </li>
          </ul>
          <p className="text-blue-100 text-sm mt-8">
            Freemium до 50 участников. Без миграций существующих чатов.
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Вход в Orbo</h1>
            <p className="text-sm text-gray-600 mb-6">
              Введите email для получения ссылки для входа
            </p>
            
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Email
                </label>
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
                {loading ? 'Отправка...' : '✉️ Получить ссылку для входа'}
              </Button>
              
              {message && (
                <div className={`p-3 rounded-lg text-sm ${
                  message.includes('Ошибка') 
                    ? 'bg-red-50 text-red-600 border border-red-200' 
                    : 'bg-green-50 text-green-700 border border-green-200'
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
