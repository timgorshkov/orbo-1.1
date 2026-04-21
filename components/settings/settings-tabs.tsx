'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export type SettingsTab = 'team' | 'general' | 'tags' | 'notifications' | 'billing' | 'portal' | 'payments' | 'finances' | 'contract' /* deprecated, redirects to payments */

interface SettingsTabsProps {
  activeTab: SettingsTab
  orgId: string
}

const TABS = [
  { id: 'team', label: 'Команда' },
  { id: 'general', label: 'Основные' },
  { id: 'portal', label: 'Портал пространства' },
  { id: 'tags', label: 'Теги участников' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'payments', label: 'Приём платежей' },
  { id: 'finances', label: 'Финансы' },
  { id: 'billing', label: 'Тариф и оплата' },
] as const

export default function SettingsTabs({ activeTab, orgId }: SettingsTabsProps) {
  const router = useRouter()

  const handleTabChange = (tabId: string) => {
    router.push(`/p/${orgId}/settings?tab=${tabId}`)
  }

  return (
    <div className="px-6 overflow-x-auto">
      <div className="flex gap-6 border-b border-gray-200 min-w-max">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'pb-3 text-sm font-medium transition-colors relative whitespace-nowrap',
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

