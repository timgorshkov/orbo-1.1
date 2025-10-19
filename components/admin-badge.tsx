import { Shield, Crown } from 'lucide-react'

interface AdminBadgeProps {
  isOwner?: boolean
  isAdmin?: boolean
  customTitle?: string | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function AdminBadge({ 
  isOwner = false, 
  isAdmin = false, 
  customTitle = null,
  size = 'md',
  showLabel = true
}: AdminBadgeProps) {
  if (!isOwner && !isAdmin) return null

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  if (isOwner) {
    return (
      <span 
        className={`inline-flex items-center gap-1 ${textSizeClasses[size]} text-purple-700`}
        title={customTitle || "Владелец группы"}
      >
        <Crown className={`${sizeClasses[size]} fill-purple-600`} />
        {showLabel && (customTitle || "Владелец")}
      </span>
    )
  }

  if (isAdmin) {
    return (
      <span 
        className={`inline-flex items-center gap-1 ${textSizeClasses[size]} text-blue-700`}
        title={customTitle || "Администратор"}
      >
        <Shield className={sizeClasses[size]} />
        {showLabel && (customTitle || "Админ")}
      </span>
    )
  }

  return null
}

