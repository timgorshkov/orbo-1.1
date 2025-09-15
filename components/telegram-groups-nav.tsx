'use client'

import Link from 'next/link'
import clsx from 'clsx'

interface TelegramGroup {
  id: number
  title: string | null
  tg_chat_id: number
}

interface TelegramGroupsNavProps {
  groups: TelegramGroup[]
  orgId: string
  currentPath?: string
}

export default function TelegramGroupsNav({ groups, orgId, currentPath }: TelegramGroupsNavProps) {
  if (!groups || groups.length === 0) return null;
  
  return (
    <div className="pt-4">
      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide px-3 mb-2">
        Telegram группы
      </div>
      {groups.map(group => (
        <Link
          key={`group-${group.id}`}
          href={`/app/${orgId}/telegram/groups/${group.id}`}
          className={clsx(
            "flex items-center px-3 py-2 text-sm rounded-xl",
            currentPath === `/app/${orgId}/telegram/groups/${group.id}`
              ? "bg-black text-white"
              : "hover:bg-black/5"
          )}
        >
          <span className="mr-2">#</span>
          {group.title || `Группа ${group.tg_chat_id}`}
        </Link>
      ))}
    </div>
  )
}
