'use client'

import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import Link from 'next/link'

type Participant = {
  id: string
  full_name: string
  bio: string | null
  photo_url: string | null
  registered_at: string
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
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-3">Принимают участие</h3>
        <div className="text-sm text-neutral-500">Загрузка...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-3">Принимают участие</h3>
        <div className="text-sm text-red-600">{error}</div>
      </div>
    )
  }

  if (participants.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-3">Принимают участие</h3>
        <div className="text-sm text-neutral-500">Пока никто не зарегистрировался</div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">Принимают участие</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {participants.map(participant => {
          const CardContent = (
            <div className="flex flex-col items-center text-center p-2 hover:bg-neutral-50 transition-colors rounded">
              {/* Photo */}
              <div className="w-12 h-12 rounded-full bg-neutral-200 overflow-hidden mb-2 flex-shrink-0">
                {participant.photo_url ? (
                  <img
                    src={participant.photo_url}
                    alt={participant.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-500 text-lg font-semibold">
                    {participant.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="font-medium text-xs text-neutral-900 mb-0.5 line-clamp-2 leading-tight">
                {participant.full_name}
              </div>

              {/* Bio */}
              {participant.bio && (
                <div className="text-xs text-neutral-600 line-clamp-1 leading-tight">
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

