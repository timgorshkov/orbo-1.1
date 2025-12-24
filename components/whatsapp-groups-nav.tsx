'use client'

import Link from 'next/link'
import clsx from 'clsx'

interface WhatsAppGroup {
  id: string
  group_name: string | null
  messages_imported: number
}

interface WhatsAppGroupsNavProps {
  groups: WhatsAppGroup[]
  orgId: string
  currentPath?: string
}

export default function WhatsAppGroupsNav({ groups, orgId, currentPath = '' }: WhatsAppGroupsNavProps) {
  if (!groups || groups.length === 0) {
    return null
  }
  
  return (
    <div className="pt-2">
      <div className="flex items-center justify-between px-3 mb-2">
        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
          WhatsApp
        </div>
      </div>
      {groups.map(group => (
        <Link
          key={`wa-${group.id}`}
          href={`/p/${orgId}/telegram/whatsapp/${group.id}`}
          className={clsx(
            "flex items-center px-3 py-2 text-sm rounded-xl",
            currentPath === `/p/${orgId}/telegram/whatsapp/${group.id}`
              ? "bg-black text-white"
              : "hover:bg-black/5"
          )}
        >
          <span className="mr-2 text-sm">💬</span>
          <span className="truncate">
            {group.group_name || 'WhatsApp чат'}
          </span>
        </Link>
      ))}
    </div>
  )
}

