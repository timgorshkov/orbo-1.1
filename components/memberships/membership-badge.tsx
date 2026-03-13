'use client'

import { Crown } from 'lucide-react'

export type MembershipStatusType = 'active' | 'trial' | 'pending' | 'expired' | 'cancelled' | 'suspended' | null | undefined

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active:    { label: 'Член клуба',  bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  trial:     { label: 'Пробный',     bg: 'bg-blue-50',     text: 'text-blue-700' },
  pending:   { label: 'Ожидает',     bg: 'bg-yellow-50',   text: 'text-yellow-700' },
  expired:   { label: 'Истёк',       bg: 'bg-red-50',      text: 'text-red-700' },
  cancelled: { label: 'Отменён',     bg: 'bg-gray-100',    text: 'text-gray-500' },
  suspended: { label: 'Приостановлен', bg: 'bg-orange-50', text: 'text-orange-700' },
}

interface MembershipBadgeProps {
  status: MembershipStatusType
  compact?: boolean
}

export function MembershipBadge({ status, compact }: MembershipBadgeProps) {
  if (!status) return null
  const config = STATUS_CONFIG[status]
  if (!config) return null

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.bg} ${config.text}`}
        title={config.label}
      >
        <Crown className="h-2.5 w-2.5" />
        {config.label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Crown className="h-3 w-3" />
      {config.label}
    </span>
  )
}
