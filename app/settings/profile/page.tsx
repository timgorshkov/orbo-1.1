'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

export default function ProfileActivationPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'loading' | 'input' | 'verify' | 'success' | 'already_activated'>('loading')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [profileStatus, setProfileStatus] = useState<any>(null)

  // Загружаем статус профиля при монтировании
  useEffect(() => {
    checkActivationStatus()
  }, [])

  const checkActivationStatus = async () => {
    try {
      const response = await fetch('/api/auth/activate-profile')
      const data = await response.json()
      
      setProfileStatus(data)
      
      if (data.has_email && !data.is_shadow_profile) {
        setStep('already_activated')
      } else if (data.needs_activation) {
        setStep('input')
      } else {
        setStep('input')
      }
    } catch (err) {
      console.error('Error checking activation status:', err)
      setStep('input') // Fallback
    }
  }

  const handleSendCode = async () => {
    if (!email || !email.includes('@')) {
      setError('Введите корректный email')
      return
    }

    setLoading(true)
    setError(null)
    setDevCode(null)
    
    try {
      const response = await fetch('/api/auth/activate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'send_code' })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Не удалось отправить код')
      }
      
      if (data.conflict) {
        // Показать диалог разрешения конфликта
        setError(data.message)
        return
      }
      
      // Сохраняем dev код если есть
      if (data.dev_code) {
        setDevCode(data.dev_code)
      }
      
      setStep('verify')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      setError('Введите 6-значный код')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/auth/activate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, action: 'verify_code' })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Неверный код')
      }
      
      setStep('success')
      
      // Перезагрузить страницу через 2 секунды
      setTimeout(() => {
        window.location.href = '/orgs'
      }, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'loading') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-neutral-400" size={32} />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'already_activated') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Профиль активирован</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex gap-3">
                <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
                <div className="text-sm text-green-800">
                  <p className="font-medium mb-1">У вас есть полные права администратора</p>
                  <p>Email: <strong>{profileStatus?.email}</strong></p>
                  <p className="mt-2">Вы можете создавать и редактировать материалы, события и управлять участниками.</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => window.location.href = '/orgs'}
              className="w-full"
            >
              Перейти к организациям
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Активация профиля администратора</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'input' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Для получения полных прав администратора</p>
                    <p>Добавьте и подтвердите ваш email. После этого вы сможете создавать и редактировать материалы и события.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Email адрес
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendCode()
                    }
                  }}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                onClick={handleSendCode}
                disabled={!email || loading}
                className="w-full"
              >
                {loading && <Loader2 className="animate-spin mr-2" size={16} />}
                {loading ? 'Отправка...' : 'Отправить код подтверждения'}
              </Button>
            </>
          )}

          {step === 'verify' && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                Код подтверждения отправлен на <strong>{email}</strong>
                {devCode && (
                  <p className="mt-2 font-mono bg-white p-2 rounded border border-green-300">
                    [DEV] Код: {devCode}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Код подтверждения
                </label>
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  className="text-center text-lg tracking-wider font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && code.length === 6) {
                      handleVerifyCode()
                    }
                  }}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Введите 6-значный код из письма
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('input')
                    setCode('')
                    setError(null)
                  }}
                  disabled={loading}
                >
                  Назад
                </Button>
                <Button
                  onClick={handleVerifyCode}
                  disabled={code.length !== 6 || loading}
                  className="flex-1"
                >
                  {loading && <Loader2 className="animate-spin mr-2" size={16} />}
                  {loading ? 'Проверка...' : 'Подтвердить'}
                </Button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="text-center py-6">
              <CheckCircle className="text-green-600 mx-auto mb-4" size={48} />
              <h3 className="text-lg font-semibold mb-2">Email подтверждён!</h3>
              <p className="text-neutral-600 text-sm">
                Теперь у вас есть полные права администратора. Перенаправление...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

