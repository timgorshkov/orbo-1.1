'use client'

import { useState, useEffect } from 'react'
import { Users, Link as LinkIcon, Check, CheckCircle2 } from 'lucide-react'
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
  is_admin: boolean
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
  const [checkingIn, setCheckingIn] = useState<string | null>(null)

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

  const handleCheckIn = async (registrationId: string) => {
    setCheckingIn(registrationId)
    try {
      const response = await fetch(`/api/events/${eventId}/participants/${registrationId}/checkin`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to check in participant')
      }

      // Update participant status locally
      setParticipants(prev =>
        prev.map(p =>
          p.registration_id === registrationId
            ? { ...p, status: 'attended' }
            : p
        )
      )
    } catch (err) {
      console.error('Error checking in participant:', err)
      alert('Не удалось отметить участника')
    } finally {
      setCheckingIn(null)
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {participants.map(participant => {
          const isCheckedIn = participant.status === 'attended'
          const isAdmin = participant.is_admin
          
          const CardContent = (
            <div className="flex flex-col items-center text-center p-2 hover:bg-neutral-50 transition-colors rounded relative">
              {/* Check-in status badge */}
              {isCheckedIn && (
                <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5" title="Отметился">
                  <CheckCircle2 className="w-3 h-3" />
                </div>
              )}
              
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
              
              {/* Admin check-in button */}
              {isAdmin && !isCheckedIn && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleCheckIn(participant.registration_id)
                  }}
                  disabled={checkingIn === participant.registration_id}
                  className="mt-2 px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Отметить участника"
                >
                  {checkingIn === participant.registration_id ? '...' : '✓ Отметить'}
                </button>
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

