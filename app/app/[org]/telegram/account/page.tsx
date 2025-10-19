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
  const [error, setError] = useState<string | React.ReactNode | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  
  // Форма для добавления Telegram ID
  const [telegramUserId, setTelegramUserId] = useState('')
  
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
          telegramUserId: parseInt(telegramUserId)
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'BOT_BLOCKED') {
          setError(
            <span>
              Пожалуйста, сначала запустите диалог с{' '}
              <a 
                href="https://t.me/orbo_assistant_bot" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-red-700 hover:underline font-medium"
              >
                @orbo_assistant_bot
              </a>
              {' '}в Telegram
            </span>
          )
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

  const getTelegramUserIdInstructions = () => {
    return (
      <div>
        <p className="font-medium mb-2">Как получить ваш Telegram User ID:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Запустите бота:</strong> откройте <a href="https://t.me/orbo_assistant_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">@orbo_assistant_bot</a> в Telegram и нажмите <code className="bg-blue-100 px-1 rounded">/start</code>
          </li>
          <li>
            <strong>Получите ID:</strong> бот автоматически отправит вам ваш Telegram User ID
          </li>
          <li>
            <strong>Скопируйте:</strong> нажмите на ID в сообщении бота, чтобы скопировать его
          </li>
          <li>
            <strong>Вставьте:</strong> вставьте ID в поле ниже и сохраните
          </li>
        </ol>
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          💡 <strong>Важно:</strong> Сначала запустите бота, иначе код верификации не сможет быть доставлен!
        </div>
      </div>
    )
  }
  
  // Функция для синхронизации групп
  const syncGroups = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    
    // Явно выводим ID организации для отладки
    console.log(`Syncing groups for organization ID: ${params.org}`)
    
    try {
      // Шаг 1: Обновляем права администраторов для всех групп
      console.log('Step 1: Updating admin rights...')
      const adminResponse = await fetch('/api/telegram/groups/update-admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orgId: params.org })
      });
      
      const adminData = await adminResponse.json();
      
      if (!adminResponse.ok) {
        throw new Error(adminData.error || 'Failed to update admin rights');
      }
      
      console.log(`Admin rights updated: ${adminData.updated} administrators`);
      
      // Шаг 2: Синхронизируем группы
      console.log('Step 2: Syncing groups...')
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
      
      setSyncResult(`Успешно обновлено ${adminData.updated} администраторов и синхронизировано ${data.groups?.length || 0} групп`)
      
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
    <div className="p-6">
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

          {/* Форма для верификации кода - показываем сначала, если аккаунт не верифицирован */}
          {telegramAccount && !telegramAccount.is_verified && (
            <Card>
              <CardHeader>
                <CardTitle>Подтверждение аккаунта</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 p-4 rounded-lg">
                  <h3 className="font-medium text-amber-900 mb-2">Подтвердите ваш аккаунт</h3>
                  <div className="text-sm text-amber-800">
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Откройте <a href="https://t.me/orbo_assistant_bot" target="_blank" rel="noopener noreferrer" className="text-amber-900 hover:underline font-medium">@orbo_assistant_bot</a> в Telegram</li>
                      <li>Нажмите /start если еще не сделали этого</li>
                      <li>Вы должны получить код верификации</li>
                      <li>Введите код в поле ниже</li>
                    </ol>
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
                <div className="text-sm text-blue-800">
                  {getTelegramUserIdInstructions()}
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
                <p className="mt-2 text-xs text-neutral-500">
                  ℹ️ Username, имя и фамилия будут автоматически загружены из вашего Telegram-профиля
                </p>
              </div>

              <Button onClick={handleSaveTelegramId} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить и отправить код верификации'}
              </Button>
            </CardContent>
          </Card>

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
    </div>
  )
}
