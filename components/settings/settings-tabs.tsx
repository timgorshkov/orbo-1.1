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
    <div className="px-6">
      <div className="flex gap-6 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'pb-3 text-sm font-medium transition-colors relative',
              'focus-visible:outline-none',
              activeTab === tab.id
                ? 'text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

