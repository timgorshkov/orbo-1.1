'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface GroupSelectionCardProps {
  chatId: number;
  title: string;
  orgId: string;
}

export function GroupSelectionCard({ chatId, title, orgId }: GroupSelectionCardProps) {
  const [isAdding, setIsAdding] = useState(false)
  const router = useRouter()
  
  const addGroup = async () => {
    setIsAdding(true)
    try {
      const response = await fetch('/api/telegram/bot/add-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, chatId })
      })
      
      if (response.ok) {
        router.refresh()
        // После короткой задержки перенаправляем на страницу телеграма
        setTimeout(() => {
          router.push(`/app/${orgId}/telegram`)
        }, 1000)
      }
    } catch (error) {
      console.error('Error adding group:', error)
    } finally {
      setIsAdding(false)
    }
  }
  
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <h3 className="font-medium">{title}</h3>
          <div className="text-sm text-neutral-500">ID: {chatId}</div>
        </div>
        
        <Button onClick={addGroup} disabled={isAdding}>
          {isAdding ? 'Добавление...' : 'Добавить'}
        </Button>
      </CardContent>
    </Card>
  )
}
