'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function CheckStatusForm({ orgId, action }: { orgId: string, action: any }) {
  const [isChecking, setIsChecking] = useState(false)
  const router = useRouter()
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsChecking(true)
    
    // Создаем FormData с org_id
    const formData = new FormData()
    formData.append('org', orgId)
    
    // Вызываем серверное действие
    try {
      await action(formData)
      // Обновляем страницу для отображения изменений
      router.refresh()
    } catch (error) {
      console.error("Ошибка проверки статуса:", error)
    } finally {
      setIsChecking(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <Button type="submit" disabled={isChecking}>
        {isChecking ? 'Проверка...' : 'Проверить статус'}
      </Button>
    </form>
  )
}

export function AddGroupManuallyForm({ orgId }: { orgId: string }) {
  const [chatId, setChatId] = useState('')
  const router = useRouter()
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/telegram/bot/add-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, chatId: Number(chatId) })
      })
      
      if (response.ok) {
        router.refresh()
        setChatId('')
      }
    } catch (error) {
      console.error('Error adding group:', error)
    }
  }
  
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input 
        type="text" 
        value={chatId}
        onChange={(e) => setChatId(e.target.value)}
        placeholder="ID группы, например: -1001234567890" 
        className="flex-1 px-3 py-2 border rounded-lg"
        required
      />
      <Button type="submit">Добавить</Button>
    </form>
  )
}

