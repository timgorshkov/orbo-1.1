'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Participant {
  id: string
  full_name: string | null
  tg_username: string | null
  tg_user_id: string | null
  email: string | null
  photo_url: string | null
}

interface MemberCardProps {
  participant: Participant
}

export default function MemberCard({ participant }: MemberCardProps) {
  const params = useParams()
  const orgId = params?.org as string

  const displayName = participant.full_name || participant.tg_username || 'Без имени'
  const username = participant.tg_username
    ? `@${participant.tg_username}`
    : participant.email || ''

  // Placeholder для фото
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Link
      href={`/app/${orgId}/members/${participant.id}`}
      className="group flex flex-col items-center rounded-lg border border-gray-200 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-lg"
    >
      {/* Фото или placeholder */}
      {participant.photo_url ? (
        <img
          src={participant.photo_url}
          alt={displayName}
          className="mb-4 h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-2xl font-bold text-white">
          {initials}
        </div>
      )}

      {/* Имя */}
      <h3 className="mb-1 text-center text-lg font-semibold text-gray-900 group-hover:text-blue-600">
        {displayName}
      </h3>

      {/* Username или email */}
      {username && (
        <p className="text-sm text-gray-500">{username}</p>
      )}
    </Link>
  )
}

