'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientLogger } from '@/lib/logger'

type AddVerifiedGroupProps = {
  orgId: string;
  onGroupAdded?: () => void;
}

export default function AddVerifiedGroup({ orgId, onGroupAdded }: AddVerifiedGroupProps) {
  const [chatId, setChatId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const clientLogger = createClientLogger('AddVerifiedGroup', { orgId })

  const handleAddGroup = async () => {
    if (!chatId) {
      setError('Пожалуйста, укажите Chat ID группы')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/telegram/groups/verify-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId,
          chatId: chatId.replace('@', '').replace('https://t.me/', '').replace('t.me/', '')
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify and add group')
      }

      setSuccess(data.message)
      setChatId('')
      
      if (onGroupAdded) {
        onGroupAdded()
      }
    } catch (e: any) {
      clientLogger.error({ error: e?.message, chatId }, 'Error adding verified group')
      setError(e.message || 'Failed to add group')
    } finally {
      setLoading(false)
    }
  }

  const getChatIdHelp = () => {
    return `Как найти Chat ID группы:

1. Через бота @userinfobot:
   • Добавьте @userinfobot в группу
   • Отправьте команду /start
   • Бот покажет Chat ID группы

2. Через веб-версию Telegram:
   • Откройте группу в веб-версии
   • Посмотрите на URL: t.me/c/1234567890/1
   • Chat ID: -1001234567890 (добавьте -100 в начало)

3. Через @getidsbot:
   • Добавьте @getidsbot в группу
   • Отправьте команду /start
   • Бот покажет информацию о группе`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Добавить Telegram группу</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Требования для добавления группы:</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <div>✅ У вас должен быть подтвержденный Telegram аккаунт в этой организации</div>
            <div>✅ Вы должны быть администратором или владельцем группы</div>
            <div>✅ Бот @orbo_community_bot должен быть добавлен в группу как администратор</div>
          </div>
        </div>

        <div className="bg-amber-50 p-4 rounded-lg">
          <h3 className="font-medium text-amber-900 mb-2">Как найти Chat ID группы?</h3>
          <div className="text-sm text-amber-800 whitespace-pre-line">
            {getChatIdHelp()}
          </div>
        </div>

        <div>
          <label className="text-sm text-neutral-600 block mb-2">
            Chat ID группы *
          </label>
          <Input
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="Например: -1001234567890 или @groupname"
          />
          <div className="text-xs text-neutral-500 mt-1">
            Можно указать Chat ID (число) или username группы (@groupname)
          </div>
        </div>

        <Button onClick={handleAddGroup} disabled={loading || !chatId}>
          {loading ? 'Проверка и добавление...' : 'Проверить права и добавить группу'}
        </Button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <strong>Ошибка:</strong> {error}
            {error.includes('No verified Telegram account') && (
              <div className="mt-2">
                <a 
                  href={`/app/${orgId}/telegram/account`}
                  className="text-red-800 underline hover:no-underline"
                >
                  Настройте Telegram аккаунт →
                </a>
              </div>
            )}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            <strong>Успешно:</strong> {success}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
