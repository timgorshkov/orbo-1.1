'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface AddChannelDialogProps {
  orgId: string
}

export function AddChannelDialog({ orgId }: AddChannelDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [channelInput, setChannelInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Clean up input - remove @ if present
      let channelIdentifier = channelInput.trim()
      if (channelIdentifier.startsWith('@')) {
        channelIdentifier = channelIdentifier.slice(1)
      }
      
      // Try to detect if it's a numeric ID or username
      const isNumeric = /^-?\d+$/.test(channelIdentifier)
      
      const response = await fetch('/api/telegram/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          ...(isNumeric 
            ? { tg_chat_id: parseInt(channelIdentifier) }
            : { username: channelIdentifier }
          )
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось добавить канал')
      }

      setSuccess(true)
      setChannelInput('')
      
      // Refresh the page after short delay
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        router.refresh()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      // Reset state when closing
      setChannelInput('')
      setError(null)
      setSuccess(false)
    }
  }

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Добавить канал
      </Button>
      
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Добавить Telegram-канал</DialogTitle>
            <DialogDescription>
              Введите username канала (например, @channel_name) или его числовой ID.
              Убедитесь, что бот @orbo_community_bot добавлен в канал как администратор.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="channel">Username или ID канала</Label>
                <Input
                  id="channel"
                  placeholder="@channel_name или -1001234567890"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  disabled={loading || success}
                />
              </div>
              
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              {success && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>Канал успешно добавлен!</span>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={loading || !channelInput.trim() || success}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Добавление...' : 'Добавить'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
