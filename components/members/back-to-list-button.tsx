'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BackToListButtonProps {
  orgId: string
  participantName?: string
}

export default function BackToListButton({ orgId, participantName }: BackToListButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(`/p/${orgId}/members`)
    }
  }

  return (
    <div className="mb-4 flex items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="text-gray-500 hover:text-gray-900 -ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Назад
      </Button>
      {participantName && (
        <span className="text-sm text-gray-400 truncate max-w-[300px]">{participantName}</span>
      )}
    </div>
  )
}
