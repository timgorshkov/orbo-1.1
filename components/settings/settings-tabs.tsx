'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

export type SettingsTab = 'team' | 'general' | 'tags' | 'digest' | 'invites'

interface SettingsTabsProps {
  activeTab: SettingsTab
  orgId: string
}

const TABS = [
  { id: 'team', label: 'Команда', icon: '👥' },
  { id: 'general', label: 'Основные', icon: '⚙️' },
  { id: 'tags', label: 'Теги участников', icon: '🏷️' },
  { id: 'digest', label: 'Дайджест', icon: '📊' },
  { id: 'invites', label: 'Приглашения', icon: '✉️' },
] as const

export default function SettingsTabs({ activeTab, orgId }: SettingsTabsProps) {
  const router = useRouter()

  const handleTabChange = (tabId: string) => {
    router.push(`/p/${orgId}/settings?tab=${tabId}`)
  }

  return (
    <div className="border-b border-gray-200 bg-white">
      <nav className="flex space-x-8 px-6" aria-label="Tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

