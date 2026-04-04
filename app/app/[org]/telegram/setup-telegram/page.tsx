'use client'
import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClientLogger } from '@/lib/logger'

export default function SetupTelegramPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = use(params);
  const [telegramId, setTelegramId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const clientLogger = createClientLogger('SetupTelegramPage', { orgId: org })
  
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
        router.push(`/app/${org}/telegram/check-groups`)
      }
    } catch (error: any) {
      clientLogger.error({ error: error?.message }, 'Error saving Telegram ID')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Настройка Telegram</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Подключите ваш аккаунт Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <p className="font-medium text-blue-900 mb-2">Как получить ваш Telegram User ID:</p>
            <ol className="space-y-2 text-sm text-blue-800 list-decimal pl-5">
              <li>
                <strong>Запустите бота:</strong> откройте <a href="https://t.me/orbo_assistant_bot" className="text-blue-600 hover:underline font-medium" target="_blank" rel="noopener noreferrer">@orbo_assistant_bot</a> в Telegram
              </li>
              <li>Нажмите <code className="bg-blue-100 px-1 rounded">/start</code></li>
              <li>Бот автоматически отправит вам ваш User ID</li>
              <li>Скопируйте ID и вставьте в поле ниже</li>
            </ol>
            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              💡 <strong>Важно:</strong> Сначала запустите бота, чтобы он мог отправлять вам коды верификации!
            </div>
          </div>
          
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
    </div>
  )
}