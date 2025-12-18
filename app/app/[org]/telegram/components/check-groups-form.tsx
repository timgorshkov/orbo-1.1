'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/logger'

interface CheckGroupsFormProps {
  orgId: string;
  userId: string;
  telegramId?: number | null;
}

export function CheckGroupsForm({ orgId, userId, telegramId }: CheckGroupsFormProps) {
  const [isChecking, setIsChecking] = useState(false)
  const router = useRouter()
  const clientLogger = createClientLogger('CheckGroupsForm', { orgId, userId })
  
  const checkGroups = async () => {
    setIsChecking(true)
    
    try {
      if (!telegramId) {
        // Если нет ID телеграма, сначала перенаправляем на настройку
        router.push(`/app/${orgId}/telegram/setup-telegram`)
        return
      }
      
      const response = await fetch('/api/telegram/bot/check-user-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, userId, telegramId })
      })
      
      if (response.ok) {
        // После успешной проверки перенаправляем на страницу выбора групп
        router.push(`/app/${orgId}/telegram/select-groups`)
      }
    } catch (error: any) {
      clientLogger.error({ error: error?.message, telegramId }, 'Error checking groups')
    } finally {
      setIsChecking(false)
    }
  }
  
  return (
    <Button onClick={checkGroups} disabled={isChecking}>
      {isChecking ? 'Проверка...' : 'Проверить мои группы'}
    </Button>
  )
}
