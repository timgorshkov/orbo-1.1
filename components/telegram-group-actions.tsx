'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function RemoveGroupButton({ groupId, orgId, onRemoved }: { groupId: number; orgId: string; onRemoved?: () => void }) {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const removeGroup = async () => {
    if (removing) return
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch('/api/telegram/groups/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ groupId, orgId })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Не удалось удалить группу')
      }

      if (onRemoved) {
        onRemoved()
      }
    } catch (e: any) {
      console.error('Error removing group:', e)
      setError(e.message || 'Не удалось удалить группу')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" className="text-red-600" onClick={removeGroup} disabled={removing}>
        {removing ? 'Удаление…' : 'Удалить из организации'}
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

