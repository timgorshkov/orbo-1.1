'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Crown, Shield, Star } from 'lucide-react'
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
  is_org_owner?: boolean // Владелец организации (фиолетовая корона)
  is_group_creator?: boolean // Создатель группы в Telegram
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

/** Иконка-значок статуса — накладывается поверх аватарки */
function StatusBadgeIcon({
  isOrgOwner,
  isGroupCreator,
  isAdmin,
}: {
  isOrgOwner?: boolean
  isGroupCreator?: boolean
  isAdmin?: boolean
}) {
  if (isOrgOwner) {
    return (
      <span title="Владелец организации">
        <Crown className="h-3.5 w-3.5 fill-purple-600 text-purple-600" />
      </span>
    )
  }
  if (isGroupCreator) {
    return (
      <span title="Создатель группы">
        <Star className="h-3.5 w-3.5 fill-blue-500 text-blue-500" />
      </span>
    )
  }
  if (isAdmin) {
    return (
      <span title="Администратор">
        <Shield className="h-3.5 w-3.5 text-blue-500" />
      </span>
    )
  }
  return null
}

export default function MemberCard({ participant }: MemberCardProps) {
  const params = useParams()
  const orgId = params?.org as string

  const displayName = participant.full_name || participant.tg_username || 'Без имени'
  const actualIsOrgOwner = participant.is_org_owner || participant.is_owner
  const hasBadge = actualIsOrgOwner || participant.is_group_creator || participant.is_admin

  return (
    <Link
      href={`/p/${orgId}/members/${participant.id}`}
      className="group flex flex-col items-center text-center p-2 hover:bg-neutral-50 transition-colors rounded"
    >
      {/* Аватарка — крупнее, значок статуса в правом нижнем углу */}
      <div className="relative w-24 h-24 mb-2 flex-shrink-0">
        <div className="w-full h-full rounded-full bg-neutral-200 overflow-hidden">
          {participant.photo_url && participant.photo_url !== 'none' ? (
            <img
              src={participant.photo_url}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-500 text-3xl font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Значок владельца/админа поверх аватарки */}
        {hasBadge && (
          <div className="absolute bottom-0.5 right-0.5 bg-white rounded-full p-0.5 shadow shadow-black/10">
            <StatusBadgeIcon
              isOrgOwner={actualIsOrgOwner}
              isGroupCreator={participant.is_group_creator}
              isAdmin={participant.is_admin}
            />
          </div>
        )}
      </div>

      {/* Имя */}
      <div
        className="font-medium text-xs text-neutral-900 mb-0.5 line-clamp-2 leading-tight max-w-full overflow-hidden break-all"
        dir="auto"
      >
        {displayName}
      </div>

      {/* Краткое описание (bio) — до 2 строк */}
      {participant.bio && (
        <div className="text-xs text-neutral-600 line-clamp-2 leading-tight">
          {participant.bio}
        </div>
      )}

      {/* Tags (max 1 displayed) */}
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
