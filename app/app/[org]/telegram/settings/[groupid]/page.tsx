'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClientBrowser } from '@/lib/client/supabaseClient'

type TelegramGroupSettings = {
  id: number;
  tg_chat_id: number;
  title: string | null;
  invite_link: string | null;
  bot_status: string | null;
  welcome_message: string | null;
  notification_enabled: boolean;
  last_sync_at: string | null;
}

export default function TelegramGroupSettingsPage({ params }: { params: { org: string, groupId: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [group, setGroup] = useState<TelegramGroupSettings | null>(null)
  const [title, setTitle] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchGroup = async () => {
      setLoading(true)
      try {
        const supabase = createClientBrowser()
        const { data, error } = await supabase
          .from('telegram_groups')
          .select('*')
          .eq('id', params.groupId)
          .eq('org_id', params.org)
          .single()

        if (error || !data) {
          console.error('Error fetching group:', error)
          setError('Не удалось загрузить данные группы')
          return
        }

        setGroup(data)
        setTitle(data.title || '')
        setWelcomeMessage(data.welcome_message || '')
        setNotificationsEnabled(!!data.notification_enabled)
      } catch (e) {
        console.error('Error:', e)
        setError('Произошла ошибка при загрузке данных')
      } finally {
        setLoading(false)
      }
    }

    fetchGroup()
  }, [params.groupId, params.org])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClientBrowser()
      const { error } = await supabase
        .from('telegram_groups')
        .update({
          title,
          welcome_message: welcomeMessage || null,
          notification_enabled: notificationsEnabled
        })
        .eq('id', params.groupId)
        .eq('org_id', params.org)

      if (error) {
        throw new Error(error.message)
      }

      setSuccess(true)
    } catch (e: any) {
      console.error('Error saving group settings:', e)
      setError(e.message || 'Произошла ошибка при сохранении настроек')
    } finally {
      setSaving(false)
    }
  }

  const refreshGroupInfo = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/telegram/bot/refresh-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId: params.org,
          groupId: params.groupId
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Ошибка при обновлении информации')
      }

      // Перезагрузить данные группы
      const supabase = createClientBrowser()
      const { data, error } = await supabase
        .from('telegram_groups')
        .select('*')
        .eq('id', params.groupId)
        .eq('org_id', params.org)
        .single()

      if (!error && data) {
        setGroup(data)
        setTitle(data.title || '')
      }

      setSuccess(true)
    } catch (e: any) {
      console.error('Error refreshing group:', e)
      setError(e.message || 'Произошла ошибка при обновлении')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram`}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Настройки Telegram группы</h1>
        <Button variant="outline" onClick={() => router.push(`/app/${params.org}/telegram`)}>
          Назад
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">Загрузка...</div>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Основная информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-neutral-600 block mb-2">
                  ID группы в Telegram
                </label>
                <Input value={group?.tg_chat_id || ''} disabled className="bg-gray-50" />
                <p className="text-xs text-neutral-500 mt-1">
                  Технический идентификатор группы в системе Telegram
                </p>
              </div>

              <div>
                <label className="text-sm text-neutral-600 block mb-2">
                  Название группы
                </label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Название группы"
                />
              </div>

              <div>
                <label className="text-sm text-neutral-600 block mb-2">
                  Статус бота
                </label>
                <div className="flex items-center">
                  <span
                    className={`inline-block w-3 h-3 rounded-full mr-2 ${
                      group?.bot_status === 'connected' ? 'bg-green-500' : 'bg-amber-500'
                    }`}
                  />
                  <span>
                    {group?.bot_status === 'connected' ? 'Подключен' : 'Ожидание прав администратора'}
                  </span>
                </div>
                {group?.last_sync_at && (
                  <p className="text-xs text-neutral-500 mt-1">
                    Последняя синхронизация: {new Date(group.last_sync_at).toLocaleString('ru')}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm text-neutral-600 block mb-2">
                  Ссылка для приглашения
                </label>
                <Input value={group?.invite_link || ''} readOnly className="bg-gray-50" />
                {!group?.invite_link && group?.bot_status !== 'connected' && (
                  <p className="text-xs text-amber-500 mt-1">
                    Для создания ссылки-приглашения бот должен быть администратором
                  </p>
                )}
              </div>

              <Button onClick={refreshGroupInfo} disabled={loading}>
                Обновить информацию о группе
              </Button>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Настройки уведомлений</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="notifications"
                  checked={notificationsEnabled}
                  onChange={e => setNotificationsEnabled(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="notifications">Включить уведомления о событиях</label>
              </div>
              <p className="text-xs text-neutral-500">
                При включении этой опции, бот будет отправлять уведомления о новых событиях в группу
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Приветственное сообщение</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-neutral-600 block mb-2">
                  Сообщение для новых участников
                </label>
                <textarea
                  className="w-full p-2 border rounded-lg min-h-[100px]"
                  value={welcomeMessage}
                  onChange={e => setWelcomeMessage(e.target.value)}
                  placeholder="Добро пожаловать в нашу группу! Здесь вы можете..."
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Поддерживается HTML-форматирование: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;
                </p>
              </div>

              {error && (
                <div className="text-red-500 text-sm">{error}</div>
              )}

              {success && (
                <div className="text-green-500 text-sm">
                  Настройки успешно сохранены
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить настройки'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  )
}
