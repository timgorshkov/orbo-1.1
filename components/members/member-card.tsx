'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AdminBadge } from '@/components/admin-badge'
import { ParticipantAvatar } from './participant-avatar'

interface Participant {
  id: string
  full_name: string | null
  tg_username: string | null
  tg_user_id: string | null
  email: string | null
  photo_url: string | null
  bio: string | null
  is_owner?: boolean
  is_admin?: boolean
  custom_title?: string | null
}

interface MemberCardProps {
  participant: Participant
}

export default function MemberCard({ participant }: MemberCardProps) {
  const params = useParams()
  const orgId = params?.org as string

  const displayName = participant.full_name || participant.tg_username || 'Без имени'

  return (
    <Link
      href={`/app/${orgId}/members/${participant.id}`}
      className="group flex flex-col items-center rounded-lg border border-gray-200 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-lg"
    >
      {/* Фото или placeholder */}
      <div className="mb-4">
        <ParticipantAvatar
          participantId={participant.id}
          photoUrl={participant.photo_url}
          tgUserId={participant.tg_user_id}
          displayName={displayName}
          size="lg"
        />
      </div>

      {/* Имя */}
      <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 group-hover:text-blue-600">
        {displayName}
      </h3>

      {/* Admin badge */}
      {(participant.is_owner || participant.is_admin) && (
        <div className="mb-2 flex justify-center">
          <AdminBadge 
            isOwner={participant.is_owner}
            isAdmin={participant.is_admin}
            customTitle={participant.custom_title}
            size="sm"
            showLabel={true}
          />
        </div>
      )}

      {/* Краткое описание (bio) */}
      {participant.bio && (
        <p className="text-sm text-center text-gray-600 line-clamp-2">
          {participant.bio}
        </p>
      )}
    </Link>
  )
}

