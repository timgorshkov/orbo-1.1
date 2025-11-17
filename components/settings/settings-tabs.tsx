'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export type SettingsTab = 'team' | 'general' | 'tags' | 'digest' | 'invites'

interface SettingsTabsProps {
  activeTab: SettingsTab
  orgId: string
}

const TABS = [
  { id: 'team', label: 'Команда' },
  { id: 'general', label: 'Основные' },
  { id: 'tags', label: 'Теги участников' },
  { id: 'digest', label: 'Дайджест' },
  { id: 'invites', label: 'Приглашения' },
] as const

export default function SettingsTabs({ activeTab, orgId }: SettingsTabsProps) {
  const router = useRouter()

  const handleTabChange = (tabId: string) => {
    router.push(`/p/${orgId}/settings?tab=${tabId}`)
  }

  return (
    <div className="bg-white px-6 py-4">
      <div className="inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'hover:bg-white/50 hover:text-gray-900'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

