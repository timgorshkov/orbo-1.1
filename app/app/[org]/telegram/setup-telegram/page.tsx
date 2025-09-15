'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SetupTelegramPage({ params }: { params: { org: string } }) {
  const [telegramId, setTelegramId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  
  const saveTelegramId = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/user/telegram-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: Number(telegramId) })
      })
      
      if (response.ok) {
        router.push(`/app/${params.org}/telegram/check-groups`)
      }
    } catch (error) {
      console.error('Error saving Telegram ID:', error)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <AppShell 
      orgId={params.org} 
      currentPath={`/app/${params.org}/telegram/setup-telegram`}
      telegramGroups={[]}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Настройка Telegram</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Подключите ваш аккаунт Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-neutral-600">
            Чтобы определить ваши группы, нам нужно знать ваш ID Telegram.
          </p>
          
          <ol className="space-y-3 text-sm text-neutral-600 list-decimal pl-5">
            <li>Перейдите к боту <a href="https://t.me/userinfobot" className="text-blue-600" target="_blank">@userinfobot</a> в Telegram</li>
            <li>Нажмите "Start" или отправьте любое сообщение</li>
            <li>Бот вернет ваш ID, скопируйте его</li>
            <li>Вставьте ID в поле ниже</li>
          </ol>
          
          <form onSubmit={saveTelegramId}>
            <div className="space-y-2">
              <label htmlFor="telegramId" className="block text-sm">
                Ваш Telegram ID
              </label>
              <Input 
                id="telegramId"
                type="number" 
                value={telegramId} 
                onChange={(e) => setTelegramId(e.target.value)} 
                placeholder="Например: 123456789" 
                required
              />
            </div>
            
            <Button type="submit" className="mt-4" disabled={isSubmitting}>
              {isSubmitting ? 'Сохранение...' : 'Сохранить и продолжить'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  )
}