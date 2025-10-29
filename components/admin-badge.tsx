import { Shield, Crown, Star } from 'lucide-react'

interface AdminBadgeProps {
  isOrgOwner?: boolean // ✅ Владелец организации (фиолетовая корона)
  isGroupCreator?: boolean // ✅ Создатель группы в Telegram (синий бейдж со звездой)
  isAdmin?: boolean // Администратор (синий бейдж со щитом)
  customTitle?: string | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  // Для обратной совместимости (deprecated)
  isOwner?: boolean
}

export function AdminBadge({ 
  isOrgOwner = false,
  isGroupCreator = false,
  isAdmin = false, 
  customTitle = null,
  size = 'md',
  showLabel = true,
  isOwner = false // deprecated
}: AdminBadgeProps) {
  // Обратная совместимость: если isOwner=true, считаем это isOrgOwner
  const actualIsOrgOwner = isOrgOwner || isOwner
  
  if (!actualIsOrgOwner && !isGroupCreator && !isAdmin) return null

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

  // ✅ Приоритет 1: Владелец организации (фиолетовая корона)
  if (actualIsOrgOwner) {
    return (
      <span 
        className={`inline-flex items-center gap-1 ${textSizeClasses[size]} text-purple-700`}
        title="Владелец организации"
      >
        <Crown className={`${sizeClasses[size]} fill-purple-600`} />
        {showLabel && "Владелец"}
      </span>
    )
  }

  // ✅ Приоритет 2: Создатель группы в Telegram (синий бейдж)
  if (isGroupCreator) {
    return (
      <span 
        className={`inline-flex items-center gap-1 ${textSizeClasses[size]} text-blue-700`}
        title={customTitle || "Создатель группы"}
      >
        <Star className={`${sizeClasses[size]} fill-blue-600`} />
        {showLabel && (customTitle || "Создатель")}
      </span>
    )
  }

  // ✅ Приоритет 3: Администратор (синий бейдж)
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
