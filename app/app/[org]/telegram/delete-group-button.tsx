'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteGroup } from './actions'

type Props = {
  groupId: number
  groupTitle: string | null
  orgId: string
}

export function DeleteGroupButton({ groupId, groupTitle, orgId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleDelete = () => {
    if (!confirm(`Удалить группу "${groupTitle || `#${groupId}`}" из организации?`)) {
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append('org', orgId)
        formData.append('groupId', groupId.toString())

        const result = await deleteGroup(formData)

        if (result?.error) {
          setError(result.error)
          console.error('Delete error:', result.error)
          return
        }

        console.log(`Group ${groupId} deleted successfully, refreshing...`)
        // Принудительно обновляем страницу для перезагрузки групп
        router.refresh()
        
        // Дополнительно перенаправляем на ту же страницу с timestamp для гарантии обновления
        setTimeout(() => {
          window.location.href = `/app/${orgId}/telegram?t=${Date.now()}`
        }, 500)
      } catch (err: any) {
        setError(err.message || 'Не удалось удалить группу')
        console.error('Delete exception:', err)
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Удаление...' : 'Удалить'}
      </button>
      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  )
}

