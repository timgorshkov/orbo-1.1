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
      <div className="bg-white rounded-lg border border-neutral-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-neutral-600" />
          <h3 className="text-lg font-semibold">Участники</h3>
        </div>
        <div className="text-sm text-neutral-500">Загрузка...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-neutral-600" />
          <h3 className="text-lg font-semibold">Участники</h3>
        </div>
        <div className="text-sm text-red-600">{error}</div>
      </div>
    )
  }

  if (participants.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-neutral-600" />
          <h3 className="text-lg font-semibold">Участники</h3>
        </div>
        <div className="text-sm text-neutral-500">Пока никто не зарегистрировался</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-neutral-600" />
        <h3 className="text-lg font-semibold">
          Участники ({participants.length})
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {participants.map(participant => {
          const CardContent = (
            <div className="flex flex-col items-center text-center p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
              {/* Photo */}
              <div className="w-16 h-16 rounded-full bg-neutral-200 overflow-hidden mb-3 flex-shrink-0">
                {participant.photo_url ? (
                  <img
                    src={participant.photo_url}
                    alt={participant.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-500 text-2xl font-semibold">
                    {participant.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="font-medium text-sm text-neutral-900 mb-1 line-clamp-2">
                {participant.full_name}
              </div>

              {/* Bio */}
              {participant.bio && (
                <div className="text-xs text-neutral-600 line-clamp-2">
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

