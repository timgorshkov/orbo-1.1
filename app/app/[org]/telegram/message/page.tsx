'use client'

import { useState } from 'react'
import { useEffect } from 'react'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/client/supabaseClient'

export default function SendMessagePage({ params }: { params: { org: string } }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  // Загружаем группы при монтировании компонента
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const supabase = createClientBrowser()
        const { data, error } = await supabase
          .from('telegram_groups')
          .select('id, tg_chat_id, title, bot_status')
          .eq('org_id', params.org)
          .eq('bot_status', 'connected') // Только подключенные группы
        
        if (error) {
          console.error('Error fetching groups:', error)
          return
        }
        
        setGroups(data || [])
      } catch (e) {
        console.error('Error:', e)
      }
    }
    
    fetchGroups()
  }, [params.org])
  
  const handleSendMessage = async () => {
    if (!message || !selectedGroup) {
      setError('Необходимо выбрать группу и ввести сообщение')
      return
    }
    
    setLoading(true)
    setError(null)
    setSuccess(false)
    
    try {
      const response = await fetch('/api/telegram/bot/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId: params.org,
          chatId: selectedGroup,
          message,
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при отправке сообщения')
      }
      
      setSuccess(true)
      setMessage('')
    } catch (e: any) {
      setError(e.message || 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram`}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Отправить сообщение</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Отправка сообщения в Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-neutral-600 block mb-2">
              Выберите группу
            </label>
            <select 
              className="w-full p-2 border rounded-lg"
              value={selectedGroup || ''}
              onChange={(e) => setSelectedGroup(Number(e.target.value))}
            >
              <option value="">Выберите группу</option>
              {groups.map((group) => (
                <option key={group.id} value={group.tg_chat_id}>
                  {group.title || `Группа ${group.tg_chat_id}`}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-sm text-neutral-600 block mb-2">
              Текст сообщения
            </label>
            <textarea 
              className="w-full p-2 border rounded-lg min-h-[100px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Введите текст сообщения..."
            />
            <p className="text-xs text-neutral-500 mt-1">
              Поддерживается HTML-форматирование: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;a href="..."&gt;ссылка&lt;/a&gt;
            </p>
          </div>
          
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
          
          {success && (
            <div className="text-green-500 text-sm">
              Сообщение успешно отправлено!
            </div>
          )}
          
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => router.push(`/app/${params.org}/telegram`)}
            >
              Назад
            </Button>
            <Button 
              onClick={handleSendMessage}
              disabled={loading || !selectedGroup || !message}
            >
              {loading ? 'Отправка...' : 'Отправить сообщение'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  )
}
