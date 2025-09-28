'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type TelegramAccount = {
  id: number;
  telegram_user_id: number;
  telegram_username?: string;
  telegram_first_name?: string;
  telegram_last_name?: string;
  is_verified: boolean;
  verified_at?: string;
  created_at: string;
}

export default function TelegramAccountPage({ params }: { params: { org: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [telegramAccount, setTelegramAccount] = useState<TelegramAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  
  // Форма для добавления Telegram ID
  const [telegramUserId, setTelegramUserId] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')
  const [telegramFirstName, setTelegramFirstName] = useState('')
  const [telegramLastName, setTelegramLastName] = useState('')
  
  // Форма для верификации
  const [verificationCode, setVerificationCode] = useState('')

  useEffect(() => {
    fetchTelegramAccount()
  }, [params.org])

  const fetchTelegramAccount = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/telegram/accounts?orgId=${params.org}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch telegram account')
      }

      setTelegramAccount(data.telegramAccount)
      
      if (data.telegramAccount) {
        setTelegramUserId(data.telegramAccount.telegram_user_id.toString())
        setTelegramUsername(data.telegramAccount.telegram_username || '')
        setTelegramFirstName(data.telegramAccount.telegram_first_name || '')
        setTelegramLastName(data.telegramAccount.telegram_last_name || '')
      }
    } catch (e: any) {
      console.error('Error fetching telegram account:', e)
      setError(e.message || 'Failed to fetch telegram account')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTelegramId = async () => {
    if (!telegramUserId) {
      setError('Пожалуйста, укажите Telegram User ID')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/telegram/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId: params.org,
          telegramUserId: parseInt(telegramUserId),
          telegramUsername: telegramUsername || null,
          telegramFirstName: telegramFirstName || null,
          telegramLastName: telegramLastName || null
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'BOT_BLOCKED') {
          setError('Пожалуйста, сначала запустите диалог с @orbo_assistant_bot в Telegram')
        } else {
          throw new Error(data.error || 'Failed to save telegram account')
        }
        return
      }

      setSuccess(data.message)
      setTelegramAccount(data.telegramAccount)
    } catch (e: any) {
      console.error('Error saving telegram account:', e)
      setError(e.message || 'Failed to save telegram account')
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode) {
      setError('Пожалуйста, введите код верификации')
      return
    }

    setVerifying(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/telegram/accounts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId: params.org,
          verificationCode
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify code')
      }

      setSuccess(data.message)
      setTelegramAccount(data.telegramAccount)
      setVerificationCode('')
      
      // Если аккаунт успешно верифицирован, запускаем синхронизацию групп
      if (data.telegramAccount?.is_verified) {
        syncGroups()
      }
    } catch (e: any) {
      console.error('Error verifying code:', e)
      setError(e.message || 'Failed to verify code')
    } finally {
      setVerifying(false)
    }
  }

  const getTelegramUserId = () => {
    return `Чтобы узнать ваш Telegram User ID:
1. Откройте @userinfobot в Telegram
2. Отправьте команду /start
3. Бот покажет ваш User ID (числовой идентификатор)
4. Скопируйте этот ID и введите в поле ниже`
  }
  
  // Функция для синхронизации групп
  const syncGroups = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    
    // Явно выводим ID организации для отладки
    console.log(`Syncing groups for organization ID: ${params.org}`)
    
    try {
      const response = await fetch('/api/telegram/groups/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId: params.org
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync groups')
      }
      
      setSyncResult(`Успешно синхронизировано ${data.groups?.length || 0} групп`)
      
      // Перенаправляем пользователя на страницу Telegram после небольшой задержки
      setTimeout(() => {
        router.push(`/app/${params.org}/telegram`)
      }, 2000)
    } catch (e: any) {
      console.error('Error syncing groups:', e)
      setError(e.message || 'Failed to sync groups')
    } finally {
      setSyncing(false)
    }
  }

  // Отключаем запросы к /api/telegram/groups/
  const emptyGroups = [] as any[];
  
  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram/account`} telegramGroups={emptyGroups}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Настройка Telegram аккаунта
        </h1>
        <Button variant="outline" onClick={() => router.push(`/app/${params.org}/telegram`)}>
          Назад к Telegram
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">Загрузка...</div>
      ) : (
        <div className="space-y-6">
          {/* Информация о текущем аккаунте */}
          {telegramAccount && (
            <Card>
              <CardHeader>
                <CardTitle>Текущий Telegram аккаунт</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-neutral-600">User ID</label>
                    <div className="font-mono">{telegramAccount.telegram_user_id}</div>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Username</label>
                    <div>{telegramAccount.telegram_username ? `@${telegramAccount.telegram_username}` : 'Не указан'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Имя</label>
                    <div>{telegramAccount.telegram_first_name || 'Не указано'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Статус верификации</label>
                    <div className={`inline-flex items-center px-2 py-1 rounded text-sm ${
                      telegramAccount.is_verified 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {telegramAccount.is_verified ? '✅ Подтвержден' : '⏳ Ожидает подтверждения'}
                    </div>
                  </div>
                </div>
                {telegramAccount.verified_at && (
                  <div className="mt-4">
                    <label className="text-sm text-neutral-600">Подтвержден</label>
                    <div>{new Date(telegramAccount.verified_at).toLocaleString('ru')}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Форма для добавления/изменения Telegram ID */}
          <Card>
            <CardHeader>
              <CardTitle>
                {telegramAccount ? 'Изменить Telegram аккаунт' : 'Добавить Telegram аккаунт'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Как узнать Telegram User ID?</h3>
                <div className="text-sm text-blue-800 whitespace-pre-line">
                  {getTelegramUserId()}
                </div>
              </div>

              <div>
                <label className="text-sm text-neutral-600 block mb-2">
                  Telegram User ID *
                </label>
                <Input
                  type="number"
                  value={telegramUserId}
                  onChange={e => setTelegramUserId(e.target.value)}
                  placeholder="Например: 123456789"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-neutral-600 block mb-2">
                  Username (необязательно)
                </label>
                <Input
                  value={telegramUsername}
                  onChange={e => setTelegramUsername(e.target.value)}
                  placeholder="Например: johndoe (без @)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    Имя (необязательно)
                  </label>
                  <Input
                    value={telegramFirstName}
                    onChange={e => setTelegramFirstName(e.target.value)}
                    placeholder="Ваше имя"
                  />
                </div>
                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    Фамилия (необязательно)
                  </label>
                  <Input
                    value={telegramLastName}
                    onChange={e => setTelegramLastName(e.target.value)}
                    placeholder="Ваша фамилия"
                  />
                </div>
              </div>

              <Button onClick={handleSaveTelegramId} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить и отправить код верификации'}
              </Button>
            </CardContent>
          </Card>

          {/* Форма для верификации кода */}
          {telegramAccount && !telegramAccount.is_verified && (
            <Card>
              <CardHeader>
                <CardTitle>Подтверждение аккаунта</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 p-4 rounded-lg">
                  <h3 className="font-medium text-amber-900 mb-2">Подтвердите ваш аккаунт</h3>
                  <div className="text-sm text-amber-800">
                    1. Откройте @orbo_assistant_bot в Telegram<br/>
                    2. Нажмите /start если еще не сделали этого<br/>
                    3. Вы должны получить код верификации<br/>
                    4. Введите код в поле ниже
                  </div>
                </div>

                <div>
                  <label className="text-sm text-neutral-600 block mb-2">
                    Код верификации
                  </label>
                  <Input
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value.toUpperCase())}
                    placeholder="Введите код из Telegram"
                    maxLength={8}
                  />
                </div>

                <Button onClick={handleVerifyCode} disabled={verifying}>
                  {verifying ? 'Проверка...' : 'Подтвердить код'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Сообщения об ошибках и успехе */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              {success}
            </div>
          )}

          {/* Следующие шаги */}
          {telegramAccount?.is_verified && (
            <Card>
              <CardHeader>
                <CardTitle>✅ Аккаунт подтвержден!</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-neutral-600 mb-4">
                  Теперь вы можете добавлять Telegram группы, в которых вы являетесь администратором.
                </p>
                
                <div className="flex flex-col gap-4">
                  <Button 
                    onClick={syncGroups} 
                    disabled={syncing}
                    className="w-full mb-2"
                  >
                    {syncing ? 'Синхронизация групп...' : 'Синхронизировать мои группы'}
                  </Button>
                  
                  <Button 
                    onClick={async () => {
                      setSyncing(true);
                      setSyncResult(null);
                      setError(null);
                      
                      try {
                        const response = await fetch('/api/telegram/groups/update-admins', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ orgId: params.org })
                        });
                        
                        const data = await response.json();
                        
                        if (!response.ok) {
                          throw new Error(data.error || 'Failed to update admin rights');
                        }
                        
                        setSyncResult(`Обновлены права администраторов: ${data.updated} из ${data.total}`);
                        
                        // Перенаправляем пользователя на страницу Telegram после небольшой задержки
                        setTimeout(() => {
                          router.push(`/app/${params.org}/telegram`);
                        }, 2000);
                      } catch (e: any) {
                        console.error('Error updating admin rights:', e);
                        setError(e.message || 'Failed to update admin rights');
                      } finally {
                        setSyncing(false);
                      }
                    }}
                    variant="outline"
                    disabled={syncing}
                    className="w-full"
                  >
                    {syncing ? 'Обновление прав...' : 'Обновить права администраторов'}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={() => router.push(`/app/${params.org}/telegram`)}
                    className="w-full"
                  >
                    Перейти к управлению группами
                  </Button>
                </div>
                
                {syncResult && (
                  <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                    {syncResult}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  )
}
