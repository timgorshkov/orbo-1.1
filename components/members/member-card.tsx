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
  is_owner?: boolean // Для обратной совместимости (= is_org_owner)
  is_org_owner?: boolean // ✅ Владелец организации (фиолетовая корона)
  is_group_creator?: boolean // ✅ Создатель группы в Telegram (синий бейдж)
  is_admin?: boolean // Администратор (организации или группы)
  custom_title?: string | null
  tags?: Array<{
    id: string
    name: string
    color: string
  }>
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
      href={`/p/${orgId}/members/${participant.id}`}
      className="group flex flex-col items-center text-center p-2 hover:bg-neutral-50 transition-colors rounded"
    >
      {/* Фото или placeholder */}
      <div className="w-12 h-12 rounded-full bg-neutral-200 overflow-hidden mb-2 flex-shrink-0">
        {participant.photo_url ? (
          <img
            src={participant.photo_url}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 text-lg font-semibold">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Имя */}
      <div className="font-medium text-xs text-neutral-900 mb-0.5 line-clamp-2 leading-tight">
        {displayName}
      </div>

      {/* Admin badge - компактный */}
      {(participant.is_org_owner || participant.is_group_creator || participant.is_admin) && (
        <div className="mb-0.5 flex justify-center">
          <AdminBadge 
            isOrgOwner={participant.is_org_owner}
            isGroupCreator={participant.is_group_creator}
            isAdmin={participant.is_admin}
            customTitle={participant.custom_title}
            size="sm"
            showLabel={false}
          />
        </div>
      )}

      {/* Краткое описание (bio) */}
      {participant.bio && (
        <div className="text-xs text-neutral-600 line-clamp-1 leading-tight">
          {participant.bio}
        </div>
      )}

      {/* Tags (admin only, max 1 displayed) */}
      {participant.tags && participant.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {participant.tags.slice(0, 1).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {participant.tags.length > 1 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-700">
              +{participant.tags.length - 1}
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

