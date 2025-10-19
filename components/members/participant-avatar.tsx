'use client'

import { useTelegramPhoto } from '@/lib/hooks/useTelegramPhoto'

interface ParticipantAvatarProps {
  participantId: string
  photoUrl: string | null
  tgUserId: string | null
  displayName: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ParticipantAvatar({
  participantId,
  photoUrl: initialPhotoUrl,
  tgUserId,
  displayName,
  size = 'md',
  className = ''
}: ParticipantAvatarProps) {
  // Автоматически подгружаем фото из Telegram, если его нет
  const { photoUrl } = useTelegramPhoto(
    participantId,
    initialPhotoUrl,
    tgUserId ? Number(tgUserId) : null
  )

  // Placeholder для фото
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Размеры в зависимости от size
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-24 w-24 text-2xl'
  }

  const baseClass = `rounded-full object-cover ${sizeClasses[size]} ${className}`

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={displayName}
        className={baseClass}
      />
    )
  }

  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 font-bold text-white ${baseClass}`}>
      {initials}
    </div>
  )
}

