'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../ui/button'
import MembersView from './members-view'
import InvitesManager from '../settings/invites-manager'
import { useAdminMode } from '@/lib/hooks/useAdminMode'

interface Participant {
  id: string
  full_name: string | null
  tg_username: string | null
  tg_user_id: string | null
  email: string | null
  bio: string | null
  custom_attributes: any
  participant_status: string
  photo_url: string | null
}

interface MembersTabsProps {
  orgId: string
  initialParticipants: Participant[]
  initialInvites: any[]
  availableTags?: any[]
  role: 'owner' | 'admin' | 'member' | 'guest'
  activeTab: string
}

export default function MembersTabs({
  orgId,
  initialParticipants,
  initialInvites,
  availableTags = [],
  role,
  activeTab: initialTab,
}: MembersTabsProps) {
  const router = useRouter()
  const { adminMode, isAdmin } = useAdminMode(role)
  const [activeTab, setActiveTab] = useState(initialTab)
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    router.push(`/p/${orgId}/members?tab=${tab}`, { scroll: false })
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6">
        <div className="inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600">
          <button
            onClick={() => handleTabChange('list')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
              activeTab === 'list'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'hover:bg-white/50 hover:text-gray-900'
            }`}
          >
            Список
          </button>

          {showAdminFeatures && (
            <button
              onClick={() => handleTabChange('invites')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                activeTab === 'invites'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'hover:bg-white/50 hover:text-gray-900'
              }`}
            >
              Приглашения
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' && (
        <MembersView
          orgId={orgId}
          initialParticipants={initialParticipants}
          availableTags={availableTags}
          isAdmin={isAdmin}
          adminMode={adminMode}
        />
      )}

      {activeTab === 'invites' && showAdminFeatures && (
        <InvitesManager orgId={orgId} initialInvites={initialInvites} />
      )}
    </div>
  )
}

