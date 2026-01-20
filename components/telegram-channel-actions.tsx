'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

interface RemoveChannelButtonProps {
  channelId: string
  channelTitle: string
  orgId: string
  onRemoved?: () => void
}

export function RemoveChannelButton({ 
  channelId, 
  channelTitle,
  orgId, 
  onRemoved 
}: RemoveChannelButtonProps) {
  const router = useRouter()
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const removeChannel = async () => {
    if (removing) return
    
    const confirmMessage = `Вы уверены, что хотите удалить канал "${channelTitle}" из организации?\n\n` +
      `Это действие НЕ удалит:\n` +
      `• Канал из Telegram\n` +
      `• Историю постов\n` +
      `• Подписчиков канала\n` +
      `• События активности\n\n` +
      `Вы сможете добавить канал заново, и вся история восстановится.`
    
    if (!confirm(confirmMessage)) {
      return
    }
    
    setRemoving(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/telegram/channels/${channelId}/remove?orgId=${orgId}`, {
        method: 'DELETE'
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось удалить канал')
      }

      console.log(`Channel ${channelId} removed successfully from org ${orgId}`)
      
      if (onRemoved) {
        onRemoved()
      }
      
      // Refresh the page
      router.refresh()
      
      // Redirect to channels page after a short delay
      setTimeout(() => {
        window.location.href = `/p/${orgId}/telegram/channels?t=${Date.now()}`
      }, 500)
    } catch (e: any) {
      console.error('Error removing channel:', e)
      setError(e.message || 'Не удалось удалить канал')
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={removeChannel}
        disabled={removing}
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        {removing ? 'Удаление...' : 'Удалить из организации'}
      </Button>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
