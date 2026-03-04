'use client'

import { useState, useEffect } from 'react'
import { Users, Link as LinkIcon, Check } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type Participant = {
  id: string
  registration_id: string
  full_name: string
  bio: string | null
  photo_url: string | null
  registered_at: string
  status: string
  is_authenticated: boolean
}

type Props = {
  eventId: string
  orgId: string
  showParticipantsList: boolean
}

export default function EventParticipantsList({ eventId, orgId, showParticipantsList }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const handleCopyParticipantsLink = async () => {
    const url = `${window.location.origin}/p/${orgId}/events/${eventId}#participants`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  useEffect(() => {
    if (!showParticipantsList) {
      setLoading(false)
      return
    }

    fetch(`/api/events/${eventId}/participants`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to load participants')
        }
        return res.json()
      })
      .then(data => {
        setParticipants(data.participants || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading participants:', err)
        setError('Не удалось загрузить список участников')
        setLoading(false)
      })
  }, [eventId, showParticipantsList])

  if (!showParticipantsList) {
    return null
  }

  if (loading) {
    return (
      <div id="participants" className="p-4 scroll-mt-4">
        <h3 className="text-lg font-semibold mb-3">Принимают участие</h3>
        <div className="text-sm text-neutral-500">Загрузка...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div id="participants" className="p-4 scroll-mt-4">
        <h3 className="text-lg font-semibold mb-3">Принимают участие</h3>
        <div className="text-sm text-red-600">{error}</div>
      </div>
    )
  }

  if (participants.length === 0) {
    return (
      <div id="participants" className="p-4 scroll-mt-4">
        <h3 className="text-lg font-semibold mb-3">Принимают участие</h3>
        <div className="text-sm text-neutral-500">Пока никто не зарегистрировался</div>
      </div>
    )
  }

  return (
    <div id="participants" className="p-4 scroll-mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Принимают участие</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyParticipantsLink}
          className="text-neutral-500 hover:text-neutral-700"
          title="Скопировать ссылку на участников"
        >
          {linkCopied ? (
            <Check className="w-4 h-4" />
          ) : (
            <LinkIcon className="w-4 h-4" />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        {participants.map(participant => {
          const photoUrl = participant.photo_url && participant.photo_url !== 'none' && participant.photo_url !== 'null'
            ? participant.photo_url
            : null

          const CardContent = (
            <div className="flex flex-col items-center text-center hover:opacity-80 transition-opacity w-20">
              {/* Photo */}
              <div className="w-14 h-14 rounded-full bg-neutral-200 overflow-hidden mb-1.5 flex-shrink-0">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={participant.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-semibold">
                    {participant.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="text-xs text-neutral-900 line-clamp-2 leading-tight w-full">
                {participant.full_name}
              </div>

              {/* Bio */}
              {participant.bio && (
                <div className="text-xs text-neutral-500 line-clamp-1 leading-tight mt-0.5">
                  {participant.bio}
                </div>
              )}
            </div>
          )

          // Make clickable only for authenticated users
          if (participant.is_authenticated) {
            return (
              <Link
                key={participant.id}
                href={`/p/${orgId}/members/${participant.id}`}
                className="block"
              >
                {CardContent}
              </Link>
            )
          }

          // Non-clickable for unauthenticated users
          return (
            <div key={participant.id}>
              {CardContent}
            </div>
          )
        })}
      </div>
    </div>
  )
}

