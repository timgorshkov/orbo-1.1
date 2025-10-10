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
  const isSettingsActive = currentPath?.startsWith(`/app/${orgId}/telegram`)
  
  return (
    <div className="pt-4">
      <div className="flex items-center justify-between px-3 mb-2">
        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
          Telegram группы
        </div>
        <Link
          href={`/app/${orgId}/telegram`}
          className={clsx(
            "p-1 rounded-md transition-colors",
            isSettingsActive && !currentPath?.includes('/groups/')
              ? "bg-black text-white"
              : "hover:bg-black/5 text-neutral-400 hover:text-neutral-600"
          )}
          title="Настройки Telegram"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="w-4 h-4"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </Link>
      </div>
      {groups && groups.length > 0 && groups.map(group => (
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
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="w-4 h-4 mr-2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          {group.title || `Группа ${group.tg_chat_id}`}
        </Link>
      ))}
    </div>
  )
}
